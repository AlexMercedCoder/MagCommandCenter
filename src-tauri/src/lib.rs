use serde::Serialize;
use std::{
    env,
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Command, Stdio},
};
use tauri::Emitter;

#[derive(Serialize)]
struct CommandResult {
    ok: bool,
    command: String,
    stdout: String,
    stderr: String,
    status: Option<i32>,
}

#[derive(Clone, Serialize)]
struct StreamEvent {
    id: String,
    stream: String,
    line: String,
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

#[tauri::command]
fn run_magent_stream(window: tauri::Window, id: String, args: Vec<String>) -> CommandResult {
    let binary = magent_binary();
    let command_string = format!("{} {}", binary, args.join(" "));
    let mut child = match Command::new(&binary)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return CommandResult {
                ok: false,
                command: command_string,
                stdout: String::new(),
                stderr: error.to_string(),
                status: None,
            };
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_id = id.clone();
    let stderr_id = id.clone();
    let stdout_window = window.clone();
    let stderr_window = window.clone();

    let stdout_handle =
        std::thread::spawn(move || read_stream(stdout, stdout_window, stdout_id, "stdout"));
    let stderr_handle =
        std::thread::spawn(move || read_stream(stderr, stderr_window, stderr_id, "stderr"));

    let status = child.wait();
    let stdout_text = stdout_handle.join().unwrap_or_default();
    let stderr_text = stderr_handle.join().unwrap_or_default();

    match status {
        Ok(status) => CommandResult {
            ok: status.success(),
            command: command_string,
            stdout: stdout_text,
            stderr: stderr_text,
            status: status.code(),
        },
        Err(error) => CommandResult {
            ok: false,
            command: command_string,
            stdout: stdout_text,
            stderr: format!("{}{}", stderr_text, error),
            status: None,
        },
    }
}

fn read_stream(
    stream: Option<impl std::io::Read>,
    window: tauri::Window,
    id: String,
    name: &str,
) -> String {
    let Some(stream) = stream else {
        return String::new();
    };
    let mut text = String::new();
    for line in BufReader::new(stream).lines().map_while(Result::ok) {
        text.push_str(&line);
        text.push('\n');
        let _ = window.emit(
            "magent-stream",
            StreamEvent {
                id: id.clone(),
                stream: name.to_string(),
                line,
            },
        );
    }
    text
}

#[tauri::command]
fn run_setup_command(program: String, args: Vec<String>) -> CommandResult {
    if !is_allowed_setup_command(&program, &args) {
        return CommandResult {
            ok: false,
            command: format!("{} {}", program, args.join(" ")),
            stdout: String::new(),
            stderr: "setup command is not allowed".to_string(),
            status: None,
        };
    }

    match Command::new(&program).args(&args).output() {
        Ok(output) => CommandResult {
            ok: output.status.success(),
            command: format!("{} {}", program, args.join(" ")),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            status: output.status.code(),
        },
        Err(error) => CommandResult {
            ok: false,
            command: format!("{} {}", program, args.join(" ")),
            stdout: String::new(),
            stderr: error.to_string(),
            status: None,
        },
    }
}

fn is_allowed_setup_command(program: &str, args: &[String]) -> bool {
    let program_path = PathBuf::from(program);
    let name = program_path
        .file_name()
        .and_then(|item| item.to_str())
        .unwrap_or(program);

    match name {
        "magent" => args == ["--version"],
        "pipx" => {
            args == ["install", "magagent"]
                || args == ["upgrade", "magagent"]
                || args == ["ensurepath"]
        }
        "python" | "python3" => args == ["-m", "pip", "install", "--user", "-U", "magagent"],
        _ => false,
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            run_magent,
            run_magent_stream,
            run_setup_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mag Command Center");
}
