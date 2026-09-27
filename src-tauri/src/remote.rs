//! Experimental remote runtime: a native client for MagAgent's `magent serve --rpc`
//! gateway (protocol `magent.rpc.v1`, C-9 and C-13).
//!
//! The renderer never talks to the network (the CSP only allows IPC). It asks Rust to
//! connect; Rust confirms the host in a native dialog, keeps the endpoint and token in
//! memory (and, if asked, the token in the OS credential store), and forwards calls only
//! to that host. Streaming runs are long-polled here with `stream.events`, so their lines
//! go through the same approval capture, `magent-stream` events, tray, and notifications
//! as a local run.
use crate::CommandResult;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{Emitter, Manager, Url};

const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
/// Gateway long-poll window; the HTTP timeout leaves room above it.
const LONG_POLL_MS: u64 = 20_000;
const KEYRING_SERVICE: &str = "mag-command-center-remote-runtime";

#[derive(Clone)]
struct RemoteConfig {
    url: Url,
    token: String,
}

fn config() -> &'static Mutex<Option<RemoteConfig>> {
    static CONFIG: OnceLock<Mutex<Option<RemoteConfig>>> = OnceLock::new();
    CONFIG.get_or_init(|| Mutex::new(None))
}

/// HTTPS anywhere, or plain HTTP on loopback only. Credentials in the URL are refused.
pub fn validate_endpoint(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim())
        .map_err(|_| "Enter a full URL, for example https://agent-host.example/rpc".to_string())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Put the access token in the token field, not in the URL.".to_string());
    }
    let loopback = matches!(
        url.host_str(),
        Some("localhost") | Some("127.0.0.1") | Some("[::1]") | Some("::1")
    );
    match url.scheme() {
        "https" => Ok(url),
        "http" if loopback => Ok(url),
        _ => Err(
            "Remote runtimes require HTTPS; plain HTTP is allowed only on loopback.".to_string(),
        ),
    }
}

pub fn validate_token(token: &str) -> Result<(), String> {
    if token.trim().is_empty() || token.len() > 4096 || token.contains(['\r', '\n']) {
        return Err("A bounded runtime access token is required.".to_string());
    }
    Ok(())
}

fn origin(url: &Url) -> String {
    url.origin().ascii_serialization()
}

fn keyring_entry(url: &Url) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &origin(url)).map_err(|error| error.to_string())
}

fn saved_token(url: &Url) -> Option<String> {
    keyring_entry(url).ok()?.get_password().ok()
}

async fn confirm_host(app: tauri::AppHandle, host: String) -> Result<bool, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let message = format!(
        "Send Mag Command Center commands to the remote runtime at\n{host}\n\nThat host will run MagAgent commands on your behalf and see their arguments. Only connect to a gateway you operate."
    );
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title("Connect to a remote runtime?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Connect".to_string(),
                "Cancel".to_string(),
            ))
            .blocking_show()
    })
    .await
    .map_err(|error| error.to_string())
}

/// Connects to a gateway. An empty `token` uses the one saved for this host, if any.
/// `remember` saves the token in the OS credential store (never in app state).
#[tauri::command]
pub async fn configure_remote_runtime(
    app: tauri::AppHandle,
    endpoint: String,
    token: String,
    remember: Option<bool>,
) -> Result<String, String> {
    let url = validate_endpoint(&endpoint)?;
    let host = origin(&url);
    let (token, from_store) = if token.trim().is_empty() {
        match saved_token(&url) {
            Some(saved) => (saved, true),
            None => return Err("Paste the gateway's access token.".to_string()),
        }
    } else {
        (token, false)
    };
    validate_token(&token)?;
    let already = config()
        .lock()
        .map(|current| current.as_ref().map(|c| origin(&c.url)) == Some(host.clone()))
        .unwrap_or(false);
    // A token saved for this host means the user already confirmed it.
    if !already && !from_store && !confirm_host(app, host.clone()).await? {
        return Err("Remote connection cancelled.".to_string());
    }
    if remember.unwrap_or(false) && !from_store {
        keyring_entry(&url)?.set_password(&token).map_err(|error| {
            format!("Connected, but the token could not be saved to the system keychain: {error}")
        })?;
    }
    *config()
        .lock()
        .map_err(|_| "remote configuration unavailable")? = Some(RemoteConfig { url, token });
    Ok(host)
}

/// Whether a token is saved for this endpoint's host.
#[tauri::command]
pub fn remote_token_saved(endpoint: String) -> bool {
    validate_endpoint(&endpoint)
        .ok()
        .and_then(|url| saved_token(&url))
        .is_some()
}

#[tauri::command]
pub fn forget_remote_token(endpoint: String) -> Result<(), String> {
    let url = validate_endpoint(&endpoint)?;
    match keyring_entry(&url)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn disconnect_remote_runtime() {
    if let Ok(mut current) = config().lock() {
        *current = None;
    }
}

/// Extracts `result`, or a readable error that keeps the JSON-RPC code, from a response.
pub fn parse_response(body: &[u8]) -> Result<Value, String> {
    if body.len() > MAX_RESPONSE_BYTES {
        return Err("Remote runtime response exceeded the 8 MiB limit.".to_string());
    }
    let payload: Value = serde_json::from_slice(body)
        .map_err(|_| "Remote runtime returned invalid JSON.".to_string())?;
    if let Some(error) = payload.get("error") {
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Remote runtime request failed.");
        return Err(match error.get("code").and_then(Value::as_i64) {
            Some(-32601) => format!("{message}. This view needs the native desktop runtime."),
            Some(-32001) => {
                "The gateway rejected the token. Paste the token `magent serve --rpc` printed."
                    .to_string()
            }
            Some(-32029) => format!("{message} (rate limited; wait a moment)."),
            _ => message.to_string(),
        });
    }
    Ok(payload.get("result").cloned().unwrap_or(Value::Null))
}

fn next_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!("mcc-{}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

async fn call(method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
    let remote = config()
        .lock()
        .map_err(|_| "remote configuration unavailable".to_string())?
        .clone()
        .ok_or_else(|| "No remote runtime is connected.".to_string())?;
    if method.is_empty() || method.len() > 128 {
        return Err("invalid method".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(remote.url.clone())
        .bearer_auth(&remote.token)
        .json(&json!({"jsonrpc": "2.0", "id": next_id(), "method": method, "params": params}))
        .send()
        .await
        .map_err(|error| format!("Remote runtime unreachable: {error}"))?;
    let status = response.status().as_u16();
    if status == 401 {
        return Err(
            "The gateway rejected the token. Paste the token `magent serve --rpc` printed."
                .to_string(),
        );
    }
    if !(200..300).contains(&status) {
        return Err(format!("Remote runtime returned HTTP {status}."));
    }
    if response.content_length().unwrap_or(0) as usize > MAX_RESPONSE_BYTES {
        return Err("Remote runtime response exceeded the 8 MiB limit.".to_string());
    }
    let body = response.bytes().await.map_err(|error| error.to_string())?;
    parse_response(&body)
}

#[tauri::command]
pub async fn remote_runtime_request(method: String, params: Value) -> Result<Value, String> {
    call(&method, params, Duration::from_secs(30)).await
}

#[derive(Deserialize, Debug, PartialEq)]
pub struct StreamEvent {
    pub seq: u64,
    pub stream: String,
    pub line: String,
}

#[derive(Deserialize, Debug)]
pub struct EventsPage {
    #[serde(default)]
    pub events: Vec<StreamEvent>,
    pub next: u64,
    #[serde(default)]
    pub gap: bool,
    #[serde(default)]
    pub done: bool,
    pub result: Option<CommandResult>,
}

/// What the stream loop should do with one `stream.events` page.
#[derive(Debug, PartialEq)]
pub struct PageOutcome {
    /// Lines to deliver, in order, skipping any already seen.
    pub lines: Vec<(String, String)>,
    pub after: u64,
    /// True when the gateway dropped lines; the loop reports it and continues from `next`.
    pub gap: bool,
}

pub fn apply_page(page: &EventsPage, after: u64) -> PageOutcome {
    let lines = page
        .events
        .iter()
        .filter(|event| event.seq > after)
        .map(|event| (event.stream.clone(), event.line.clone()))
        .collect();
    PageOutcome {
        lines,
        after: page.next.max(after),
        gap: page.gap,
    }
}

fn deliver(window: &tauri::Window, id: &str, stream: &str, line: &str) {
    if stream == "stdout" {
        let captured = crate::approval_state::state()
            .lock()
            .map(|mut approvals| approvals.capture(id, line))
            .unwrap_or(crate::approval_state::Captured::Nothing);
        if captured.changed() {
            crate::approval_state::publish(window.app_handle(), captured);
        }
    }
    let _ = window.emit(
        "magent-stream",
        crate::StreamEvent {
            id: id.to_string(),
            stream: stream.to_string(),
            line: line.to_string(),
        },
    );
}

/// Starts `args` on the gateway and long-polls `stream.events` until done, handing each
/// new line to `on_line(stream, line)` exactly once. A reported gap is surfaced as a
/// `status` line and the loop resyncs from the gateway's cursor.
pub async fn run_stream(
    id: &str,
    args: &[String],
    mut on_line: impl FnMut(&str, &str),
) -> CommandResult {
    let started = match call(
        "stream.start",
        json!({"args": args, "id": id}),
        Duration::from_secs(30),
    )
    .await
    {
        Ok(value) => value,
        Err(error) => return CommandResult::failure("magent (remote)", error),
    };
    let command = started
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or("magent (remote)")
        .to_string();
    let mut after = 0u64;
    let mut failures = 0u32;
    let mut warned_gap = false;
    loop {
        let page = call(
            "stream.events",
            json!({"id": id, "after": after, "wait_ms": LONG_POLL_MS}),
            Duration::from_millis(LONG_POLL_MS + 15_000),
        )
        .await
        .and_then(|value| {
            serde_json::from_value::<EventsPage>(value).map_err(|error| error.to_string())
        });
        let page = match page {
            Ok(page) => {
                failures = 0;
                page
            }
            Err(error) => {
                failures += 1;
                if failures >= 5 {
                    return CommandResult::failure(
                        &command,
                        format!("Lost the remote run after 5 attempts: {error}. It may still be running on the gateway."),
                    );
                }
                on_line(
                    "status",
                    &format!("Reconnecting to the remote runtime ({error})"),
                );
                tokio_sleep(Duration::from_secs(2)).await;
                continue;
            }
        };
        let outcome = apply_page(&page, after);
        if outcome.gap && !warned_gap {
            warned_gap = true;
            on_line(
                "status",
                "The gateway dropped some earlier output (its buffer holds 5,000 lines). Resynced from the oldest line it still has.",
            );
        }
        for (stream, line) in &outcome.lines {
            on_line(stream, line);
        }
        after = outcome.after;
        if page.done {
            return page.result.unwrap_or_else(|| {
                CommandResult::failure(
                    &command,
                    "The remote run ended without a result.".to_string(),
                )
            });
        }
    }
}

/// Runs a streaming command on the gateway and relays its output like a local run.
/// Approvals are answered with `write_magent_stream` and cancelled with
/// `cancel_magent_stream`, both of which the renderer sends through the remote transport.
#[tauri::command]
pub async fn remote_stream(window: tauri::Window, id: String, args: Vec<String>) -> CommandResult {
    let result = run_stream(&id, &args, |stream, line| {
        if stream == "status" {
            crate::emit_stream_status(&window, &id, line);
        } else {
            deliver(&window, &id, stream, line);
        }
    })
    .await;
    let interrupted = crate::approval_state::state()
        .lock()
        .map(|mut approvals| approvals.finish(&id, result.status))
        .unwrap_or(0);
    if interrupted > 0 {
        crate::approval_state::publish(
            window.app_handle(),
            crate::approval_state::Captured::Resolved,
        );
    }
    crate::presence::run_finished(window.app_handle(), &id, &args, result.ok);
    result
}

async fn tokio_sleep(duration: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(duration)).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_need_https_except_on_loopback() {
        assert!(validate_endpoint("https://agent.example/rpc").is_ok());
        assert!(validate_endpoint("http://127.0.0.1:8080/rpc").is_ok());
        assert!(validate_endpoint("http://localhost/rpc").is_ok());
        assert!(validate_endpoint("http://agent.example/rpc").is_err());
        assert!(validate_endpoint("ftp://agent.example").is_err());
        assert!(validate_endpoint("https://user:pw@agent.example/rpc").is_err());
        assert!(validate_endpoint("not a url").is_err());
    }

    #[test]
    fn tokens_are_bounded_single_line() {
        assert!(validate_token("abc").is_ok());
        assert!(validate_token(" ").is_err());
        assert!(validate_token("a\nb").is_err());
        assert!(validate_token(&"x".repeat(5000)).is_err());
    }

    #[test]
    fn requests_without_a_connection_are_refused() {
        disconnect_remote_runtime();
        let result = tauri::async_runtime::block_on(remote_runtime_request(
            "runtime_info".into(),
            json!({}),
        ));
        assert_eq!(result.unwrap_err(), "No remote runtime is connected.");
    }

    /// Replays tests/fixtures/rpc_gateway/lifecycle.json from MagAgent (magent.rpc.v1).
    fn fixture() -> Value {
        serde_json::from_str(include_str!("../tests/fixtures/rpc-gateway-lifecycle.json")).unwrap()
    }

    fn exchange(name: &str) -> Value {
        fixture()["exchanges"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["name"] == name)
            .unwrap_or_else(|| panic!("fixture has no {name}"))
            .clone()
    }

    fn response(name: &str) -> Result<Value, String> {
        parse_response(exchange(name)["response"].to_string().as_bytes())
    }

    #[test]
    fn fixture_results_map_to_desktop_shapes() {
        let info = response("runtime_info").unwrap();
        assert_eq!(info["protocol"], "magent.rpc.v1");
        let run: CommandResult = serde_json::from_value(response("run_magent").unwrap()).unwrap();
        assert!(run.ok);
        assert_eq!(run.status, Some(0));
        let input: CommandResult =
            serde_json::from_value(response("run_magent_input").unwrap()).unwrap();
        assert_eq!(input.stdout, "PROFILE");
        assert_eq!(response("stream_start").unwrap()["id"], "fixture-run");
        assert_eq!(response("write_decision").unwrap(), json!(true));
        assert_eq!(response("cancel").unwrap(), json!(true));
    }

    #[test]
    fn fixture_errors_become_actionable_messages() {
        assert!(response("unauthorized")
            .unwrap_err()
            .contains("rejected the token"));
        assert!(response("forbidden_command")
            .unwrap_err()
            .contains("not available through the gateway"));
        assert!(response("project_outside_roots")
            .unwrap_err()
            .contains("allowed roots"));
        assert!(response("unknown_method")
            .unwrap_err()
            .contains("needs the native desktop runtime"));
        assert!(response("unknown_stream")
            .unwrap_err()
            .contains("no stream called"));
    }

    #[test]
    fn fixture_stream_pages_deliver_each_line_once_until_done() {
        let first: EventsPage =
            serde_json::from_value(response("stream_events_until_approval").unwrap()).unwrap();
        let outcome = apply_page(&first, 0);
        assert!(!first.done);
        assert!(outcome
            .lines
            .iter()
            .any(|(stream, line)| stream == "stdout" && line.contains("approval.requested")));
        let second: EventsPage =
            serde_json::from_value(response("stream_events_done").unwrap()).unwrap();
        assert!(second.done);
        assert!(second.result.as_ref().unwrap().ok);
        // Re-delivered events at or below `after` are skipped.
        let replay = apply_page(&first, outcome.after);
        assert!(replay.lines.is_empty());
        // The gateway fixture uses a stand-in approval line, not a full AAIS envelope, so
        // the native validator must refuse it; a real envelope relayed the same way is
        // captured.
        let mut state = crate::approval_state::ApprovalState::default();
        let stub = outcome
            .lines
            .iter()
            .find(|(_, line)| line.contains("approval.requested"))
            .unwrap();
        assert!(!state.capture("fixture-run", &stub.1).changed());
        let real: Value =
            serde_json::from_str(include_str!("../tests/fixtures/approval-lifecycle.json"))
                .unwrap();
        let page = EventsPage {
            events: vec![StreamEvent {
                seq: 1,
                stream: "stdout".into(),
                line: real["request"].to_string(),
            }],
            next: 1,
            gap: false,
            done: false,
            result: None,
        };
        let relayed = apply_page(&page, 0);
        assert!(state.capture("fixture-run", &relayed.lines[0].1).changed());
    }

    /// End-to-end against a real `magent serve --rpc` (mock provider, no paid calls).
    /// Runs only when MCC_TEST_RPC_URL and MCC_TEST_RPC_TOKEN are set.
    #[test]
    fn talks_to_a_real_gateway() {
        let (Ok(url), Ok(token)) = (
            std::env::var("MCC_TEST_RPC_URL"),
            std::env::var("MCC_TEST_RPC_TOKEN"),
        ) else {
            eprintln!("skipped: set MCC_TEST_RPC_URL and MCC_TEST_RPC_TOKEN");
            return;
        };
        *config().lock().unwrap() = Some(RemoteConfig {
            url: validate_endpoint(&url).unwrap(),
            token,
        });
        tauri::async_runtime::block_on(async {
            let info = remote_runtime_request("runtime_info".into(), json!({}))
                .await
                .unwrap();
            assert_eq!(info["protocol"], "magent.rpc.v1");
            let version: CommandResult = serde_json::from_value(
                remote_runtime_request("run_magent".into(), json!({"args": ["--version"]}))
                    .await
                    .unwrap(),
            )
            .unwrap();
            assert!(version.ok, "{version:?}");
            let mut lines = Vec::new();
            let args: Vec<String> = [
                "ask",
                "hello from the gateway test",
                "--json",
                "--provider",
                "mock",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect();
            let result = run_stream("mcc-e2e-ask", &args, |stream, line| {
                lines.push(format!("{stream}: {line}"))
            })
            .await;
            assert!(result.ok, "{result:?}");
            assert!(result.stdout.contains("mock provider"), "{}", result.stdout);
            assert!(lines.iter().any(|line| line.starts_with("stdout:")));
            let bad =
                remote_runtime_request("run_magent".into(), json!({"args": ["serve", "--rpc"]}))
                    .await
                    .unwrap_err();
            assert!(bad.contains("not available"), "{bad}");
        });
        disconnect_remote_runtime();
    }

    #[test]
    fn gaps_resync_from_the_gateway_cursor() {
        let page = EventsPage {
            events: vec![StreamEvent {
                seq: 9001,
                stream: "stdout".into(),
                line: "later".into(),
            }],
            next: 9001,
            gap: true,
            done: false,
            result: None,
        };
        let outcome = apply_page(&page, 10);
        assert!(outcome.gap);
        assert_eq!(outcome.after, 9001);
        assert_eq!(
            outcome.lines,
            vec![("stdout".to_string(), "later".to_string())]
        );
    }
}
