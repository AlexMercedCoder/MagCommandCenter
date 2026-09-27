//! Tray presence and OS notifications (C-8).
//!
//! A tray icon shows how many approvals are waiting and brings the window back. When the
//! window is not focused, the app posts an OS notification for a new approval request and
//! for a streamed run that finished (a run the user stopped is not announced). Both kinds
//! can be turned off in Settings; the renderer sends the preferences at startup.
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NotificationPrefs {
    pub approvals: bool,
    pub runs: bool,
}

impl Default for NotificationPrefs {
    fn default() -> Self {
        NotificationPrefs {
            approvals: true,
            runs: true,
        }
    }
}

fn prefs() -> &'static Mutex<NotificationPrefs> {
    static PREFS: OnceLock<Mutex<NotificationPrefs>> = OnceLock::new();
    PREFS.get_or_init(|| Mutex::new(NotificationPrefs::default()))
}

fn cancelled() -> &'static Mutex<HashSet<String>> {
    static CANCELLED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    CANCELLED.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Tray handles kept so the approval count can be updated later.
pub struct Presence<R: Runtime> {
    tray: TrayIcon<R>,
    status: MenuItem<R>,
}

/// Text for the tray tooltip and the status menu item.
pub fn approvals_label(pending: usize) -> String {
    match pending {
        0 => "No approvals waiting".to_string(),
        1 => "1 approval waiting".to_string(),
        n => format!("{n} approvals waiting"),
    }
}

/// Title and body for a finished run, or None when it should stay quiet.
pub fn run_finished_message(args: &[String], ok: bool, stopped: bool) -> Option<(String, String)> {
    if stopped {
        return None;
    }
    let what = match (
        args.first().map(String::as_str),
        args.get(1).map(String::as_str),
    ) {
        (Some("ask"), _) => "Chat run",
        (Some("graph"), Some("run")) => "Graph run",
        (Some("graph"), Some("resume")) => "Graph resume",
        (Some("goal"), _) => "Goal",
        _ => "MagAgent run",
    };
    Some(if ok {
        (
            format!("{what} finished"),
            "Open Mag Command Center to review the result.".to_string(),
        )
    } else {
        (
            format!("{what} needs attention"),
            "It ended with an error. Open Mag Command Center for details.".to_string(),
        )
    })
}

fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn window_focused<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.get_webview_window("main")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false)
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", approvals_label(0), false, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Mag Command Center", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&status, &PredefinedMenuItem::separator(app)?, &show, &quit],
    )?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip(format!("Mag Command Center: {}", approvals_label(0)))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder.build(app)?;
    app.manage(Presence { tray, status });
    Ok(())
}

/// Updates the tray count and announces a newly requested approval.
pub fn approvals_changed<R: Runtime>(
    app: &AppHandle<R>,
    pending: usize,
    new_request: Option<(String, String)>,
) {
    if let Some(presence) = app.try_state::<Presence<R>>() {
        let label = approvals_label(pending);
        let _ = presence.status.set_text(&label);
        let _ = presence
            .tray
            .set_tooltip(Some(format!("Mag Command Center: {label}")));
    }
    let enabled = prefs().lock().map(|p| p.approvals).unwrap_or(true);
    if let Some((action, summary)) = new_request {
        if enabled && !window_focused(app) {
            let body = if summary.is_empty() {
                action.clone()
            } else {
                format!("{action}: {summary}")
            };
            let _ = app
                .notification()
                .builder()
                .title("MagAgent needs your permission")
                .body(body)
                .show();
        }
    }
}

/// Remembers that the user stopped this stream so its end is not announced.
pub fn mark_cancelled(stream_id: &str) {
    if let Ok(mut set) = cancelled().lock() {
        set.insert(stream_id.to_string());
    }
}

pub fn run_finished<R: Runtime>(app: &AppHandle<R>, stream_id: &str, args: &[String], ok: bool) {
    let stopped = cancelled()
        .lock()
        .map(|mut set| set.remove(stream_id))
        .unwrap_or(false);
    let enabled = prefs().lock().map(|p| p.runs).unwrap_or(true);
    if !enabled || window_focused(app) {
        return;
    }
    if let Some((title, body)) = run_finished_message(args, ok, stopped) {
        let _ = app.notification().builder().title(title).body(body).show();
    }
}

#[tauri::command]
pub fn set_notification_preferences(approvals: bool, runs: bool) {
    if let Ok(mut current) = prefs().lock() {
        *current = NotificationPrefs { approvals, runs };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_count_approvals() {
        assert_eq!(approvals_label(0), "No approvals waiting");
        assert_eq!(approvals_label(1), "1 approval waiting");
        assert_eq!(approvals_label(3), "3 approvals waiting");
    }

    #[test]
    fn finished_runs_are_described_and_stopped_runs_stay_quiet() {
        let ask: Vec<String> = ["ask", "--json"].iter().map(|s| s.to_string()).collect();
        let graph: Vec<String> = ["graph", "run", "x.yaml"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(
            run_finished_message(&ask, true, false).unwrap().0,
            "Chat run finished"
        );
        assert_eq!(
            run_finished_message(&graph, false, false).unwrap().0,
            "Graph run needs attention"
        );
        assert!(run_finished_message(&ask, false, true).is_none());
    }

    #[test]
    fn cancelled_streams_are_remembered_once() {
        mark_cancelled("s1");
        assert!(cancelled().lock().unwrap().remove("s1"));
        assert!(!cancelled().lock().unwrap().remove("s1"));
    }
}
