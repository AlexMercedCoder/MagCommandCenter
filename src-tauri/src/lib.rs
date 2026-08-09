use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
    thread,
    time::Duration,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use tauri::Manager;

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

#[derive(Serialize)]
struct ArtifactPreview {
    path: String,
    kind: String,
    mime_type: String,
    text: Option<String>,
    data_url: Option<String>,
    bytes: usize,
    truncated: bool,
}

type ChildHandle = Arc<Mutex<std::process::Child>>;

fn running_commands() -> &'static Mutex<HashMap<String, ChildHandle>> {
    static COMMANDS: OnceLock<Mutex<HashMap<String, ChildHandle>>> = OnceLock::new();
    COMMANDS.get_or_init(|| Mutex::new(HashMap::new()))
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
    let child = Arc::new(Mutex::new(child));
    running_commands()
        .lock()
        .expect("running command registry poisoned")
        .insert(id.clone(), child.clone());
    let stdout_id = id.clone();
    let stderr_id = id.clone();
    let stdout_window = window.clone();
    let stderr_window = window.clone();

    let stdout_handle =
        std::thread::spawn(move || read_stream(stdout, stdout_window, stdout_id, "stdout"));
    let stderr_handle =
        std::thread::spawn(move || read_stream(stderr, stderr_window, stderr_id, "stderr"));

    let status = loop {
        let next = child.lock().expect("running child poisoned").try_wait();
        match next {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(error) => break Err(error),
        }
    };
    running_commands()
        .lock()
        .expect("running command registry poisoned")
        .remove(&id);
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

#[tauri::command]
fn cancel_magent_stream(id: String) -> bool {
    let child = running_commands()
        .lock()
        .expect("running command registry poisoned")
        .get(&id)
        .cloned();
    child
        .and_then(|child| {
            child
                .lock()
                .ok()
                .and_then(|mut process| process.kill().ok())
        })
        .is_some()
}

fn state_connection(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let connection = rusqlite::Connection::open(directory.join("command-center.sqlite3"))
        .map_err(|error| error.to_string())?;
    initialize_state_schema(&connection)?;
    Ok(connection)
}

fn initialize_state_schema(connection: &rusqlite::Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS app_state (
                 key TEXT PRIMARY KEY,
                 value_json TEXT NOT NULL,
                 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             PRAGMA user_version = 1;",
        )
        .map_err(|error| error.to_string())
}

fn read_state_value(connection: &rusqlite::Connection, key: &str) -> Result<Option<Value>, String> {
    let result = connection.query_row(
        "SELECT value_json FROM app_state WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(raw) => serde_json::from_str(&raw)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_state_value(
    connection: &rusqlite::Connection,
    key: &str,
    value: &Value,
) -> Result<(), String> {
    let raw = serde_json::to_string(value).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO app_state (key, value_json, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
            (key, raw),
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_app_state(app: tauri::AppHandle, key: String) -> Result<Option<Value>, String> {
    read_state_value(&state_connection(&app)?, &key)
}

#[tauri::command]
fn save_app_state(app: tauri::AppHandle, key: String, value: Value) -> Result<(), String> {
    write_state_value(&state_connection(&app)?, &key, &value)
}

#[tauri::command]
fn read_project_artifact(project: String, path: String) -> Result<ArtifactPreview, String> {
    let root = fs::canonicalize(&project).map_err(|error| error.to_string())?;
    let requested = PathBuf::from(&path);
    let candidate = if requested.is_absolute() {
        requested
    } else {
        root.join(requested)
    };
    let canonical = fs::canonicalize(candidate).map_err(|error| error.to_string())?;
    if !canonical.starts_with(&root) || !canonical.is_file() {
        return Err("artifact must be a file inside the active project".to_string());
    }
    let metadata = fs::metadata(&canonical).map_err(|error| error.to_string())?;
    let bytes = metadata.len() as usize;
    const MAX_PREVIEW_BYTES: usize = 2 * 1024 * 1024;
    let raw = fs::read(&canonical).map_err(|error| error.to_string())?;
    let preview = &raw[..raw.len().min(MAX_PREVIEW_BYTES)];
    let extension = canonical
        .extension()
        .and_then(|item| item.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let (kind, mime_type) = artifact_format(&extension);
    let (text, data_url) = if kind == "image" {
        (
            None,
            Some(format!(
                "data:{mime_type};base64,{}",
                BASE64.encode(preview)
            )),
        )
    } else if kind == "binary" {
        (None, None)
    } else {
        (Some(String::from_utf8_lossy(preview).to_string()), None)
    };
    Ok(ArtifactPreview {
        path: canonical.display().to_string(),
        kind: kind.to_string(),
        mime_type: mime_type.to_string(),
        text,
        data_url,
        bytes,
        truncated: bytes > MAX_PREVIEW_BYTES,
    })
}

#[tauri::command]
fn save_diagnostics_bundle(app: tauri::AppHandle, payload: Value) -> Result<String, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("diagnostics");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let path = directory.join(format!("mag-command-center-{timestamp}.json"));
    let redacted = redact_diagnostics(payload);
    fs::write(
        &path,
        serde_json::to_string_pretty(&redacted).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(path.display().to_string())
}

fn redact_diagnostics(value: Value) -> Value {
    match value {
        Value::Object(items) => Value::Object(
            items
                .into_iter()
                .map(|(key, value)| {
                    let normalized = key.to_ascii_lowercase();
                    if [
                        "key",
                        "token",
                        "secret",
                        "password",
                        "authorization",
                        "credential",
                    ]
                    .iter()
                    .any(|needle| normalized.contains(needle))
                    {
                        (key, Value::String("[redacted]".to_string()))
                    } else {
                        (key, redact_diagnostics(value))
                    }
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(redact_diagnostics).collect()),
        Value::String(text) => Value::String(redact_sensitive_text(&text)),
        other => other,
    }
}

fn redact_sensitive_text(text: &str) -> String {
    text.split_whitespace()
        .map(|word| {
            let clean = word.trim_matches(|character: char| {
                !character.is_ascii_alphanumeric() && character != '-' && character != '_'
            });
            if clean.starts_with("sk-")
                || clean.starts_with("Bearer_")
                || (clean.len() > 80
                    && clean.chars().all(|character| {
                        character.is_ascii_alphanumeric() || "-_".contains(character)
                    }))
            {
                word.replace(clean, "[redacted]")
            } else {
                word.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn artifact_format(extension: &str) -> (&'static str, &'static str) {
    match extension {
        "png" => ("image", "image/png"),
        "jpg" | "jpeg" => ("image", "image/jpeg"),
        "gif" => ("image", "image/gif"),
        "webp" => ("image", "image/webp"),
        "svg" => ("svg", "image/svg+xml"),
        "html" | "htm" => ("html", "text/html"),
        "md" | "markdown" => ("markdown", "text/markdown"),
        "json" => ("code", "application/json"),
        "js" | "jsx" | "ts" | "tsx" | "py" | "rs" | "css" | "toml" | "yaml" | "yml" => {
            ("code", "text/plain")
        }
        "txt" | "csv" | "log" => ("text", "text/plain"),
        "pdf" => ("binary", "application/pdf"),
        "docx" => (
            "binary",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        "pptx" => (
            "binary",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ),
        _ => ("binary", "application/octet-stream"),
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
            args == ["install", "mag-agent"]
                || args == ["upgrade", "mag-agent"]
                || args == ["ensurepath"]
        }
        "python" | "python3" => args == ["-m", "pip", "install", "--user", "-U", "mag-agent"],
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
            &files(&["install", "mag-agent"])
        ));
        assert!(is_allowed_setup_command(
            "python3",
            &files(&["-m", "pip", "install", "--user", "-U", "mag-agent"])
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

    #[test]
    fn app_state_schema_round_trips_json_values() {
        let connection = rusqlite::Connection::open_in_memory().expect("open state database");
        initialize_state_schema(&connection).expect("initialize state schema");
        assert_eq!(read_state_value(&connection, "projects").unwrap(), None);
        let value = serde_json::json!(["/tmp/one", "/tmp/two"]);
        write_state_value(&connection, "projects", &value).expect("write state");
        assert_eq!(
            read_state_value(&connection, "projects").unwrap(),
            Some(value)
        );
    }

    #[test]
    fn artifact_formats_cover_rich_and_binary_outputs() {
        assert_eq!(artifact_format("html"), ("html", "text/html"));
        assert_eq!(artifact_format("svg"), ("svg", "image/svg+xml"));
        assert_eq!(artifact_format("png"), ("image", "image/png"));
        assert_eq!(artifact_format("pptx").0, "binary");
    }

    #[test]
    fn diagnostics_redact_keys_and_secret_like_text() {
        let redacted = redact_diagnostics(serde_json::json!({
            "api_key": "sk-example-secret",
            "nested": {"message": "failed with sk-another-secret"},
            "safe": "deepseek-v4-flash"
        }));
        assert_eq!(redacted["api_key"], "[redacted]");
        assert_eq!(redacted["nested"]["message"], "failed with [redacted]");
        assert_eq!(redacted["safe"], "deepseek-v4-flash");
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            run_magent,
            run_magent_stream,
            cancel_magent_stream,
            load_app_state,
            save_app_state,
            read_project_artifact,
            save_diagnostics_bundle,
            inspect_project,
            run_setup_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mag Command Center");
}
