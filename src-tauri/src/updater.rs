//! Signed in-app updates (C-11), active only in builds that carry an updater key.
//!
//! Release CI adds `plugins.updater` (public key and the GitHub `latest.json` endpoint)
//! to the Tauri config only when the signing secrets exist; see
//! docs/RELEASE_BUILDS.md "Updater". Without it the plugin is not registered and these
//! commands report `configured: false`, so the UI can say updates come from GitHub
//! Releases instead.
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

static ENABLED: AtomicBool = AtomicBool::new(false);
static PENDING: Mutex<Option<Update>> = Mutex::new(None);

/// True when the bundled Tauri config has an updater section (public key + endpoint).
pub fn configured(config: &tauri::Config) -> bool {
    config
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("pubkey"))
        .and_then(|value| value.as_str())
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false)
}

pub fn mark_enabled() {
    ENABLED.store(true, Ordering::SeqCst);
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub configured: bool,
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub date: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    downloaded: usize,
    total: Option<u64>,
}

#[tauri::command]
pub async fn check_for_update<R: Runtime>(app: AppHandle<R>) -> Result<UpdateStatus, String> {
    let current_version = app.package_info().version.to_string();
    if !ENABLED.load(Ordering::SeqCst) {
        return Ok(UpdateStatus {
            configured: false,
            available: false,
            current_version,
            version: None,
            notes: None,
            date: None,
        });
    }
    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| format!("Could not check for updates: {error}"))?;
    let status = UpdateStatus {
        configured: true,
        available: update.is_some(),
        current_version,
        version: update.as_ref().map(|u| u.version.clone()),
        notes: update.as_ref().and_then(|u| u.body.clone()),
        date: update.as_ref().and_then(|u| u.date.map(|d| d.to_string())),
    };
    *PENDING.lock().map_err(|_| "updater state unavailable")? = update;
    Ok(status)
}

/// Downloads the checked update, verifies its signature (the plugin refuses unsigned or
/// mis-signed packages), installs it, and restarts. Emits `update-progress`.
#[tauri::command]
pub async fn install_update<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let update = PENDING
        .lock()
        .map_err(|_| "updater state unavailable")?
        .take()
        .ok_or_else(|| "Check for updates first.".to_string())?;
    let mut downloaded = 0usize;
    let progress_app = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk;
                let _ = progress_app.emit("update-progress", Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|error| format!("Update failed and nothing was changed: {error}"))?;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updater_needs_a_public_key_in_the_config() {
        let mut config: tauri::Config =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert!(
            !configured(&config),
            "the committed config must not enable the updater"
        );
        config.plugins.0.insert(
            "updater".into(),
            serde_json::json!({"pubkey": "", "endpoints": []}),
        );
        assert!(!configured(&config));
        config.plugins.0.insert(
            "updater".into(),
            serde_json::json!({"pubkey": "dW50cnVzdGVkIGNvbW1lbnQ=", "endpoints": ["https://example.com/latest.json"]}),
        );
        assert!(configured(&config));
    }
}
