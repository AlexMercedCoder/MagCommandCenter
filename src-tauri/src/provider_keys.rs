//! In-app provider key setup (C-5).
//!
//! The key travels renderer -> Rust -> `magent auth add <provider> --api-key-stdin` on the
//! child's standard input. It is never placed in argv (visible in process listings), never
//! logged, and scrubbed from anything returned to the renderer in case a future MagAgent
//! echoes it by mistake.
use crate::{run_magent_input_blocking, CommandResult};

const MAX_KEY_BYTES: usize = 4096;

fn valid_provider(provider: &str) -> bool {
    let mut chars = provider.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_lowercase() || first.is_ascii_digit())
        && provider.len() <= 64
        && provider
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "._-".contains(c))
}

/// The exact argument vector used to store a key. Kept separate for tests.
pub(crate) fn auth_add_args(provider: &str, storage: &str) -> Result<Vec<String>, String> {
    if !valid_provider(provider) {
        return Err(
            "Provider ids use lowercase letters, digits, dots, dashes, or underscores.".into(),
        );
    }
    if storage != "keyring" && storage != "config" {
        return Err("Storage must be keyring or config.".into());
    }
    Ok(vec![
        "auth".into(),
        "add".into(),
        provider.into(),
        "--api-key-stdin".into(),
        "--storage".into(),
        storage.into(),
        "--json".into(),
    ])
}

fn scrub(text: &str, secret: &str) -> String {
    if secret.len() < 4 {
        return text.to_string();
    }
    text.replace(secret, "[redacted]")
}

pub(crate) fn store_key_blocking(provider: String, key: String, storage: String) -> CommandResult {
    let secret = key.trim().to_string();
    let args = match auth_add_args(&provider, &storage) {
        Ok(args) => args,
        Err(error) => return CommandResult::failure("magent auth add", error),
    };
    if secret.is_empty() {
        return CommandResult::failure("magent auth add", "Paste an API key first.".into());
    }
    if secret.len() > MAX_KEY_BYTES || secret.contains('\n') || secret.contains('\0') {
        return CommandResult::failure(
            "magent auth add",
            "That does not look like an API key (too long or contains line breaks).".into(),
        );
    }
    let mut result = run_magent_input_blocking(args, secret.clone());
    result.stdout = scrub(&result.stdout, &secret);
    result.stderr = scrub(&result.stderr, &secret);
    result.command = scrub(&result.command, &secret);
    result
}

#[tauri::command]
pub async fn magent_auth_add(provider: String, key: String, storage: String) -> CommandResult {
    match tauri::async_runtime::spawn_blocking(move || store_key_blocking(provider, key, storage))
        .await
    {
        Ok(result) => result,
        Err(error) => {
            CommandResult::failure("magent auth add", format!("desktop worker failed: {error}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_is_never_part_of_argv() {
        let args = auth_add_args("nous-portal", "config").unwrap();
        assert_eq!(
            args,
            [
                "auth",
                "add",
                "nous-portal",
                "--api-key-stdin",
                "--storage",
                "config",
                "--json"
            ]
        );
    }

    #[test]
    fn rejects_injection_shaped_provider_ids_and_storage() {
        assert!(auth_add_args("--api-key", "config").is_err());
        assert!(auth_add_args("Open AI", "config").is_err());
        assert!(auth_add_args("openai;rm", "config").is_err());
        assert!(auth_add_args("openai", "plaintext").is_err());
        assert!(auth_add_args("openai", "keyring").is_ok());
    }

    #[test]
    fn empty_or_multiline_keys_are_refused_before_spawning() {
        let empty = store_key_blocking("openai".into(), "   ".into(), "config".into());
        assert!(!empty.ok && empty.stderr.contains("Paste an API key"));
        let multi = store_key_blocking("openai".into(), "a\nb".into(), "config".into());
        assert!(!multi.ok && multi.stderr.contains("line breaks"));
    }

    /// End-to-end against a real MagAgent (>= 1.4 / next-release) with an isolated HOME.
    /// Runs only when MCC_TEST_MAGENT_BIN points at a magent executable; for example
    /// MCC_TEST_MAGENT_BIN=../MagAgent/.venv/bin/magent cargo test provider_keys.
    #[test]
    fn stores_a_key_through_real_magent_without_echoing_it() {
        let Ok(binary) = std::env::var("MCC_TEST_MAGENT_BIN") else {
            eprintln!("skipped: set MCC_TEST_MAGENT_BIN to run");
            return;
        };
        let home = std::env::temp_dir().join(format!("mcc-auth-e2e-{}", std::process::id()));
        std::fs::create_dir_all(&home).unwrap();
        // Tests in this binary share the environment; this is the only test that sets
        // these variables.
        std::env::set_var("MAGENT_BIN", &binary);
        std::env::set_var("HOME", &home);
        let secret = "sk-mcc-e2e-fake-0123456789abcdef";
        let result = store_key_blocking("openai".into(), secret.into(), "config".into());
        assert!(result.ok, "stderr: {}", result.stderr);
        assert!(!result.stdout.contains(secret) && !result.stderr.contains(secret));
        assert!(!result.command.contains(secret));
        let config = std::fs::read_to_string(home.join(".config/magent/config.toml")).unwrap();
        assert!(
            config.contains(secret),
            "the key should be stored in config.toml"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(home.join(".config/magent/config.toml"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o077, 0, "config.toml must be owner-only");
        }
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn echoed_secrets_are_scrubbed() {
        assert_eq!(
            scrub("stored sk-test-1234 ok", "sk-test-1234"),
            "stored [redacted] ok"
        );
    }
}
