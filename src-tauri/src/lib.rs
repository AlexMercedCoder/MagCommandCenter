use serde::Serialize;
use std::process::Command;

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
    let mut command = Command::new("magent");
    command.args(&args);

    match command.output() {
        Ok(output) => CommandResult {
            ok: output.status.success(),
            command: format!("magent {}", args.join(" ")),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            status: output.status.code(),
        },
        Err(error) => CommandResult {
            ok: false,
            command: format!("magent {}", args.join(" ")),
            stdout: String::new(),
            stderr: error.to_string(),
            status: None,
        },
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_magent])
        .run(tauri::generate_context!())
        .expect("error while running Mag Command Center");
}
