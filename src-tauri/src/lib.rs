use serde::Serialize;
use std::{
    env, fs,
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

#[derive(Serialize)]
struct ProjectInspection {
    path: String,
    exists: bool,
    git_status: Option<String>,
    package_manager: Option<String>,
    frameworks: Vec<String>,
    languages: Vec<String>,
    test_commands: Vec<String>,
    dirty_files: usize,
    recommended_next_action: String,
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

#[tauri::command]
fn inspect_project(path: String) -> ProjectInspection {
    let project_path = PathBuf::from(&path);
    let exists = project_path.exists();
    let files = if exists {
        fs::read_dir(&project_path)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .filter_map(|entry| entry.file_name().to_str().map(ToString::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let git_status = if exists {
        Command::new("git")
            .args(["-C", &path, "status", "--short"])
            .output()
            .ok()
            .map(|output| String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        None
    };
    let dirty_files = git_status
        .as_ref()
        .map(|status| {
            status
                .lines()
                .filter(|line| !line.trim().is_empty())
                .count()
        })
        .unwrap_or_default();

    let package_manager = detect_package_manager(&files);
    let frameworks = detect_frameworks(&files);
    let languages = detect_languages(&files);
    let test_commands = detect_test_commands(&files, package_manager.as_deref());
    let recommended_next_action = if !exists {
        "Choose an existing project folder.".to_string()
    } else if dirty_files > 0 {
        "Review the current patch before running agent edits.".to_string()
    } else if test_commands.is_empty() {
        "Configure or document the project test command.".to_string()
    } else {
        "Run readiness, then ask MagAgent for the next project task.".to_string()
    };

    ProjectInspection {
        path,
        exists,
        git_status,
        package_manager,
        frameworks,
        languages,
        test_commands,
        dirty_files,
        recommended_next_action,
    }
}

fn detect_package_manager(files: &[String]) -> Option<String> {
    if files.iter().any(|file| file == "pnpm-lock.yaml") {
        Some("pnpm".to_string())
    } else if files.iter().any(|file| file == "yarn.lock") {
        Some("yarn".to_string())
    } else if files.iter().any(|file| file == "package-lock.json") {
        Some("npm".to_string())
    } else if files.iter().any(|file| file == "uv.lock") {
        Some("uv".to_string())
    } else if files.iter().any(|file| file == "poetry.lock") {
        Some("poetry".to_string())
    } else if files.iter().any(|file| file == "Cargo.toml") {
        Some("cargo".to_string())
    } else {
        None
    }
}

fn detect_frameworks(files: &[String]) -> Vec<String> {
    let mut frameworks = Vec::new();
    if files
        .iter()
        .any(|file| file == "tauri.conf.json" || file == "src-tauri")
    {
        frameworks.push("Tauri".to_string());
    }
    if files
        .iter()
        .any(|file| file == "vite.config.ts" || file == "vite.config.js")
    {
        frameworks.push("Vite".to_string());
    }
    if files
        .iter()
        .any(|file| file == "next.config.js" || file == "next.config.mjs")
    {
        frameworks.push("Next.js".to_string());
    }
    if files.iter().any(|file| file == "pyproject.toml") {
        frameworks.push("Python package".to_string());
    }
    frameworks
}

fn detect_languages(files: &[String]) -> Vec<String> {
    let mut languages = Vec::new();
    if files.iter().any(|file| file == "package.json") {
        languages.push("TypeScript/JavaScript".to_string());
    }
    if files
        .iter()
        .any(|file| file == "pyproject.toml" || file == "requirements.txt")
    {
        languages.push("Python".to_string());
    }
    if files.iter().any(|file| file == "Cargo.toml") {
        languages.push("Rust".to_string());
    }
    languages
}

fn detect_test_commands(files: &[String], package_manager: Option<&str>) -> Vec<String> {
    let mut commands = Vec::new();
    if files.iter().any(|file| file == "package.json") {
        commands.push(format!("{} test", package_manager.unwrap_or("npm")));
        commands.push(format!("{} run build", package_manager.unwrap_or("npm")));
    }
    if files.iter().any(|file| file == "pyproject.toml") {
        commands.push("python -m pytest".to_string());
    }
    if files.iter().any(|file| file == "Cargo.toml") {
        commands.push("cargo test".to_string());
    }
    commands
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn files(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    #[test]
    fn setup_command_allowlist_accepts_only_bootstrap_commands() {
        assert!(is_allowed_setup_command("magent", &files(&["--version"])));
        assert!(is_allowed_setup_command(
            "/usr/bin/pipx",
            &files(&["install", "magagent"])
        ));
        assert!(is_allowed_setup_command(
            "python3",
            &files(&["-m", "pip", "install", "--user", "-U", "magagent"])
        ));

        assert!(!is_allowed_setup_command(
            "magent",
            &files(&["ask", "hello"])
        ));
        assert!(!is_allowed_setup_command(
            "pipx",
            &files(&["install", "other-package"])
        ));
        assert!(!is_allowed_setup_command(
            "sh",
            &files(&["-c", "echo nope"])
        ));
    }

    #[test]
    fn project_detection_identifies_common_stacks() {
        let files = files(&[
            "package.json",
            "package-lock.json",
            "vite.config.ts",
            "src-tauri",
            "pyproject.toml",
            "Cargo.toml",
        ]);

        assert_eq!(detect_package_manager(&files), Some("npm".to_string()));
        assert_eq!(
            detect_frameworks(&files),
            vec![
                "Tauri".to_string(),
                "Vite".to_string(),
                "Python package".to_string()
            ]
        );
        assert_eq!(
            detect_languages(&files),
            vec![
                "TypeScript/JavaScript".to_string(),
                "Python".to_string(),
                "Rust".to_string()
            ]
        );
        assert_eq!(
            detect_test_commands(&files, Some("npm")),
            vec![
                "npm test".to_string(),
                "npm run build".to_string(),
                "python -m pytest".to_string(),
                "cargo test".to_string()
            ]
        );
    }

    #[test]
    fn inspect_project_reports_missing_and_existing_projects() {
        let missing = inspect_project("/path/that/should/not/exist/mag-command-center".to_string());
        assert!(!missing.exists);
        assert_eq!(missing.dirty_files, 0);
        assert_eq!(
            missing.recommended_next_action,
            "Choose an existing project folder."
        );

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let project_path = env::temp_dir().join(format!("mcc-inspect-{unique}"));
        fs::create_dir_all(&project_path).expect("create temp project");
        fs::write(project_path.join("package.json"), "{}").expect("write package json");
        fs::write(project_path.join("package-lock.json"), "{}").expect("write package lock");

        let inspected = inspect_project(project_path.display().to_string());
        assert!(inspected.exists);
        assert_eq!(inspected.package_manager, Some("npm".to_string()));
        assert_eq!(
            inspected.test_commands,
            vec!["npm test".to_string(), "npm run build".to_string()]
        );

        fs::remove_dir_all(project_path).expect("cleanup temp project");
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            run_magent,
            run_magent_stream,
            inspect_project,
            run_setup_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mag Command Center");
}
