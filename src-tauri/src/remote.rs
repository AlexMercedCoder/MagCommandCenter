//! Experimental remote runtime proxy (C-9).
//!
//! The renderer no longer fetches remote hosts itself: the content-security policy only
//! allows IPC. Instead the renderer asks Rust to connect to an endpoint, Rust confirms the
//! host with the user in a native dialog, keeps the endpoint and token in memory, and
//! forwards JSON-RPC calls only to that endpoint. A compromised renderer therefore cannot
//! send data to an arbitrary host, and never sees the token after connecting.
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::Url;

const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

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

#[tauri::command]
pub async fn configure_remote_runtime(
    app: tauri::AppHandle,
    endpoint: String,
    token: String,
) -> Result<String, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let url = validate_endpoint(&endpoint)?;
    validate_token(&token)?;
    let host = origin(&url);
    let already = config()
        .lock()
        .map(|current| current.as_ref().map(|c| origin(&c.url)) == Some(host.clone()))
        .unwrap_or(false);
    if !already {
        let message = format!(
            "Send Mag Command Center commands to the remote runtime at\n{host}\n\nThat host will run MagAgent commands on your behalf and see their arguments. Only connect to a gateway you operate."
        );
        let approved = tauri::async_runtime::spawn_blocking(move || {
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
        .map_err(|error| error.to_string())?;
        if !approved {
            return Err("Remote connection cancelled.".to_string());
        }
    }
    *config()
        .lock()
        .map_err(|_| "remote configuration unavailable")? = Some(RemoteConfig { url, token });
    Ok(host)
}

#[tauri::command]
pub fn disconnect_remote_runtime() {
    if let Ok(mut current) = config().lock() {
        *current = None;
    }
}

/// Extracts `result` or a readable error from a JSON-RPC response body.
pub fn parse_response(body: &[u8]) -> Result<Value, String> {
    if body.len() > MAX_RESPONSE_BYTES {
        return Err("Remote runtime response exceeded the 8 MiB limit.".to_string());
    }
    let payload: Value = serde_json::from_slice(body)
        .map_err(|_| "Remote runtime returned invalid JSON.".to_string())?;
    if let Some(error) = payload.get("error") {
        return Err(error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Remote runtime request failed.")
            .to_string());
    }
    Ok(payload.get("result").cloned().unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn remote_runtime_request(method: String, params: Value) -> Result<Value, String> {
    let remote = config()
        .lock()
        .map_err(|_| "remote configuration unavailable".to_string())?
        .clone()
        .ok_or_else(|| "No remote runtime is connected.".to_string())?;
    if method.is_empty() || method.len() > 128 {
        return Err("invalid method".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())?;
    let id = format!(
        "{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let response = client
        .post(remote.url.clone())
        .bearer_auth(&remote.token)
        .json(&json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}))
        .send()
        .await
        .map_err(|error| format!("Remote runtime unreachable: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Remote runtime returned HTTP {}.",
            response.status().as_u16()
        ));
    }
    if response.content_length().unwrap_or(0) as usize > MAX_RESPONSE_BYTES {
        return Err("Remote runtime response exceeded the 8 MiB limit.".to_string());
    }
    let body = response.bytes().await.map_err(|error| error.to_string())?;
    parse_response(&body)
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
    fn responses_yield_result_or_error_message() {
        assert_eq!(
            parse_response(br#"{"jsonrpc":"2.0","result":{"v":1}}"#).unwrap(),
            json!({"v":1})
        );
        assert_eq!(
            parse_response(br#"{"error":{"message":"denied"}}"#).unwrap_err(),
            "denied"
        );
        assert!(parse_response(b"<html>").is_err());
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
}
