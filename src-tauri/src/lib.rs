use serde::Serialize;
use std::{env, path::PathBuf, process::Command};

#[derive(Serialize)]
struct CommandResult {
    ok: bool,
    command: String,
    stdout: String,
    stderr: String,
    status: Option<i32>,
}

#[tauri::command]
fn run_magent(args: Vec<String>) -> CommandResult {
    let binary = magent_binary();
    let mut command = Command::new(&binary);
    command.args(&args);

    match command.output() {
        Ok(output) => CommandResult {
            ok: output.status.success(),
            command: format!("{} {}", binary, args.join(" ")),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            status: output.status.code(),
        },
        Err(error) => CommandResult {
            ok: false,
            command: format!("{} {}", binary, args.join(" ")),
            stdout: String::new(),
            stderr: error.to_string(),
            status: None,
        },
    }
}

fn magent_binary() -> String {
    if let Ok(path) = env::var("MAGENT_BIN") {
        if !path.trim().is_empty() {
            return path;
        }
    }

    let mut candidates = Vec::new();
    if let Ok(home) = env::var("HOME") {
        let home = PathBuf::from(home);
        candidates.push(home.join(".pyenv/shims/magent").display().to_string());
        candidates.push(home.join(".local/bin/magent").display().to_string());
    }

    candidates
        .into_iter()
        .find(|candidate| PathBuf::from(candidate).exists())
        .unwrap_or_else(|| "magent".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_magent])
        .run(tauri::generate_context!())
        .expect("error while running Mag Command Center");
}
