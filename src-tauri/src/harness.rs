//! Native side of the HarnessAdapter seam (Phase 6).
//!
//! A harness is an agent CLI that Command Center drives: MagAgent (`magent`) is the
//! default, Loro (`loro`, experimental in Command Center) is the second. Both speak AAIS
//! 1.0 over `--approval-stdio`, so their output flows through the same stream relay,
//! approval capture, and process-tree Stop. Prompts are delivered in an owner-only temp
//! file (`--prompt-file`), never on the command line.
use crate::{magent_binary, run_stream_blocking, CommandResult};
use serde::Serialize;
use std::{env, fs, io::Write, path::PathBuf, process::Command};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Harness {
    Magent,
    Loro,
}

impl Harness {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "magent" => Ok(Harness::Magent),
            "loro" => Ok(Harness::Loro),
            other => Err(format!(
                "Unknown harness `{other}`. Supported: magent, loro."
            )),
        }
    }

    pub fn binary(self) -> String {
        match self {
            Harness::Magent => magent_binary(),
            Harness::Loro => loro_binary(),
        }
    }
}

fn loro_binary() -> String {
    if let Ok(path) = env::var("LORO_BIN") {
        if !path.trim().is_empty() {
            return path;
        }
    }
    if let Ok(home) = env::var("HOME") {
        let home = PathBuf::from(home);
        for candidate in [".local/bin/loro", ".venvs/loro/bin/loro"] {
            let path = home.join(candidate);
            if path.exists() {
                return path.display().to_string();
            }
        }
    }
    "loro".to_string()
}

/// "Loro" or "MagAgent" for status lines, from the executable name.
pub fn label_for_binary(binary: &str) -> &'static str {
    let name = PathBuf::from(binary)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(binary)
        .to_ascii_lowercase();
    if name.starts_with("loro") {
        "Loro"
    } else {
        "MagAgent"
    }
}

#[derive(Serialize, Debug)]
pub struct Detected {
    pub harness: String,
    pub available: bool,
    pub version: Option<String>,
    pub command: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn harness_detect(harness: String) -> Result<Detected, String> {
    let kind = Harness::parse(&harness)?;
    let binary = kind.binary();
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new(&binary).arg("--version").output();
        Ok(match output {
            Ok(output) if output.status.success() => Detected {
                harness,
                available: true,
                version: String::from_utf8_lossy(&output.stdout)
                    .split_whitespace()
                    .last()
                    .map(str::to_string),
                command: binary,
                error: None,
            },
            Ok(output) => Detected {
                harness,
                available: false,
                version: None,
                command: binary,
                error: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
            },
            Err(error) => Detected {
                harness,
                available: false,
                version: None,
                command: binary,
                error: Some(error.to_string()),
            },
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Writes the prompt to an owner-only temp file and returns its path.
pub fn write_prompt_file(prompt: &str) -> Result<PathBuf, String> {
    if prompt.len() > 2 * 1024 * 1024 {
        return Err("Prompt exceeds the 2 MiB limit.".to_string());
    }
    let directory = env::temp_dir().join("mag-command-center-prompts");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!(
        "prompt-{}-{}.md",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path).map_err(|error| error.to_string())?;
    file.write_all(prompt.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(path)
}

/// Argument vector for one run: harness args, then `--prompt-file <path>` when a prompt
/// file is used. Kept separate for tests.
pub fn run_args(mut args: Vec<String>, prompt_file: Option<&PathBuf>) -> Vec<String> {
    if let Some(path) = prompt_file {
        args.push("--prompt-file".to_string());
        args.push(path.display().to_string());
    }
    args
}

#[tauri::command]
pub async fn run_harness_stream(
    window: tauri::Window,
    id: String,
    harness: String,
    args: Vec<String>,
    prompt: Option<String>,
    cwd: Option<String>,
) -> CommandResult {
    let kind = match Harness::parse(&harness) {
        Ok(kind) => kind,
        Err(error) => return CommandResult::failure(&harness, error),
    };
    let directory = match cwd.map(fs::canonicalize).transpose() {
        Ok(Some(path)) if path.is_dir() => Some(path),
        Ok(Some(_)) => {
            return CommandResult::failure(&harness, "The project folder does not exist.".into())
        }
        Ok(None) => None,
        Err(error) => return CommandResult::failure(&harness, error.to_string()),
    };
    let prompt_file = match prompt.as_deref().map(write_prompt_file).transpose() {
        Ok(path) => path,
        Err(error) => return CommandResult::failure(&harness, error),
    };
    let full_args = run_args(args, prompt_file.as_ref());
    let binary = kind.binary();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_stream_blocking(window, id, binary, full_args, directory)
    })
    .await
    .unwrap_or_else(|error| {
        CommandResult::failure(&harness, format!("desktop worker failed: {error}"))
    });
    if let Some(path) = prompt_file {
        let _ = fs::remove_file(path);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn harness_names_are_a_closed_set() {
        assert_eq!(Harness::parse("loro").unwrap(), Harness::Loro);
        assert_eq!(Harness::parse("magent").unwrap(), Harness::Magent);
        assert!(Harness::parse("bash").is_err());
    }

    /// End-to-end with a real Loro CLI (its default offline mock provider, no paid calls).
    /// Runs only when MCC_TEST_LORO_BIN is set; uses a temp HOME and project folder.
    #[test]
    fn runs_a_real_loro_with_the_prompt_in_a_file() {
        let Ok(binary) = std::env::var("MCC_TEST_LORO_BIN") else {
            eprintln!("skipped: set MCC_TEST_LORO_BIN");
            return;
        };
        let root = env::temp_dir().join(format!("mcc-loro-e2e-{}", std::process::id()));
        let project = root.join("project");
        fs::create_dir_all(&project).unwrap();
        let prompt = write_prompt_file("Say hello from the harness test").unwrap();
        let args = run_args(
            vec!["run".into(), "--json".into(), "--approval-stdio".into()],
            Some(&prompt),
        );
        let output = Command::new(&binary)
            .args(&args)
            .current_dir(&project)
            .env("HOME", &root)
            .stdin(std::process::Stdio::null())
            .output()
            .unwrap();
        let _ = fs::remove_file(&prompt);
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let last = stdout.lines().rfind(|line| line.starts_with('{')).unwrap();
        let result: serde_json::Value = serde_json::from_str(last).unwrap();
        assert_eq!(result["ok"], true);
        assert!(result["response"]
            .as_str()
            .unwrap()
            .contains("harness test"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn labels_follow_the_executable() {
        assert_eq!(label_for_binary("/home/a/.local/bin/loro"), "Loro");
        assert_eq!(label_for_binary("magent"), "MagAgent");
    }

    #[test]
    fn prompts_go_in_an_owner_only_file_not_argv() {
        let secret = "summarize the private roadmap";
        let path = write_prompt_file(secret).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), secret);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o077, 0);
        }
        let args = run_args(vec!["run".into(), "--json".into()], Some(&path));
        assert!(!args.iter().any(|arg| arg.contains(secret)));
        assert_eq!(args[2], "--prompt-file");
        fs::remove_file(path).unwrap();
        assert!(write_prompt_file(&"x".repeat(3 * 1024 * 1024)).is_err());
    }
}
