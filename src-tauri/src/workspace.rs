use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const MAX_FILE_BYTES: usize = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_INLINE_BYTES: usize = 256 * 1024;
const MAX_CONTEXT_BYTES: usize = 750 * 1024;
const MAX_CONTEXT_FILES: usize = 20;
const MAX_FILES: usize = 1_000;
const IGNORED_PARTS: &[&str] = &[
    ".git",
    ".venv",
    "node_modules",
    "dist",
    "build",
    "target",
    "__pycache__",
    ".pytest_cache",
];

#[derive(Clone, Debug, Serialize)]
pub struct WorkspaceFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    pub artifact: bool,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceFiles {
    pub files: Vec<WorkspaceFile>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
pub struct AdjacentProject {
    pub name: String,
    pub path: String,
    pub current: bool,
    pub launch_command: String,
}

#[derive(Debug, Serialize)]
pub struct WorkspacePreview {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    pub text: bool,
    pub content: Option<String>,
    pub data_url: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
pub struct ContextReference {
    pub path: String,
    pub size: u64,
    pub inline: bool,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceContext {
    pub prompt: String,
    pub references: Vec<ContextReference>,
    pub inline_bytes: usize,
}

#[derive(Debug, Serialize)]
pub struct GitWorktree {
    pub worktree: String,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub detached: bool,
    pub current: bool,
}

#[derive(Debug, Serialize)]
pub struct GitState {
    pub ok: bool,
    pub status: Vec<String>,
    pub branches: Vec<String>,
    pub current_branch: String,
    pub worktrees: Vec<GitWorktree>,
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct ProcessResult {
    pub ok: bool,
    pub status: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

#[derive(Debug, Deserialize)]
pub struct UploadRequest {
    pub name: String,
    pub data_base64: String,
    pub session_id: String,
}

fn root(raw: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(raw).map_err(|error| error.to_string())?;
    if !root.is_dir() {
        return Err("workspace must be an existing directory".to_string());
    }
    Ok(root)
}

fn confined(root: &Path, raw: &str, allow_attachment: bool) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.contains('\0') {
        return Err("path is required".to_string());
    }
    let requested = PathBuf::from(raw);
    let candidate = if requested.is_absolute() {
        requested
    } else {
        root.join(requested)
    };
    let canonical = if candidate.exists() {
        fs::canonicalize(&candidate).map_err(|error| error.to_string())?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| "path has no parent".to_string())?;
        fs::canonicalize(parent)
            .map_err(|error| error.to_string())?
            .join(
                candidate
                    .file_name()
                    .ok_or_else(|| "path is invalid".to_string())?,
            )
    };
    if !canonical.starts_with(root) {
        return Err("path escapes the selected workspace".to_string());
    }
    let relative = canonical
        .strip_prefix(root)
        .map_err(|error| error.to_string())?;
    if relative
        .components()
        .next()
        .is_some_and(|part| part.as_os_str() == ".magent")
    {
        let attachment = relative
            .components()
            .nth(1)
            .is_some_and(|part| part.as_os_str() == "attachments");
        if !(allow_attachment && attachment) {
            return Err("MagAgent internal state is not exposed in the workspace UI".to_string());
        }
    }
    Ok(canonical)
}

fn mime_for(path: &Path) -> (&'static str, bool, bool) {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => ("image/png", false, true),
        "jpg" | "jpeg" => ("image/jpeg", false, true),
        "gif" => ("image/gif", false, true),
        "webp" => ("image/webp", false, true),
        "svg" => ("image/svg+xml", true, true),
        "pdf" => ("application/pdf", false, true),
        "docx" => (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            false,
            true,
        ),
        "pptx" => (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            false,
            true,
        ),
        "xlsx" => (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            false,
            true,
        ),
        "html" | "htm" => ("text/html", true, true),
        "md" | "markdown" => ("text/markdown", true, true),
        "json" => ("application/json", true, true),
        "yaml" | "yml" => ("application/yaml", true, false),
        "c" | "cpp" | "css" | "go" | "h" | "java" | "js" | "jsx" | "py" | "rs" | "sh" | "toml"
        | "ts" | "tsx" | "txt" | "xml" | "csv" | "log" => (
            "text/plain",
            true,
            matches!(
                path.extension().and_then(|value| value.to_str()),
                Some("csv" | "txt")
            ),
        ),
        _ => ("application/octet-stream", false, false),
    }
}

fn walk(root: &Path, directory: &Path, needle: &str, files: &mut Vec<WorkspaceFile>, depth: usize) {
    if files.len() >= MAX_FILES || depth > 64 {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut entries = entries.filter_map(Result::ok).collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        if files.len() >= MAX_FILES {
            return;
        }
        let path = entry.path();
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        let parts = relative
            .components()
            .filter_map(|part| part.as_os_str().to_str())
            .collect::<Vec<_>>();
        if parts.iter().any(|part| IGNORED_PARTS.contains(part)) {
            continue;
        }
        if parts.first() == Some(&".magent") && parts.get(1) != Some(&"attachments") {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            walk(root, &path, needle, files, depth + 1);
        } else if kind.is_file() {
            let relative = relative.to_string_lossy().replace('\\', "/");
            if !needle.is_empty() && !relative.to_ascii_lowercase().contains(needle) {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            let (mime, _, artifact) = mime_for(&path);
            files.push(WorkspaceFile {
                path: relative,
                name: entry.file_name().to_string_lossy().to_string(),
                size: metadata.len(),
                mime: mime.to_string(),
                artifact,
            });
        }
    }
}

#[tauri::command]
pub fn list_workspace_files(project: String, query: String) -> Result<WorkspaceFiles, String> {
    let root = root(&project)?;
    let mut files = Vec::new();
    walk(
        &root,
        &root,
        &query.trim().to_ascii_lowercase(),
        &mut files,
        0,
    );
    let truncated = files.len() >= MAX_FILES;
    Ok(WorkspaceFiles { files, truncated })
}

#[tauri::command]
pub fn list_adjacent_projects(project: String) -> Result<Vec<AdjacentProject>, String> {
    let root = root(&project)?;
    let parent = root
        .parent()
        .ok_or_else(|| "workspace has no parent".to_string())?;
    let mut projects = Vec::new();
    let entries = fs::read_dir(parent).map_err(|error| error.to_string())?;
    for entry in entries.filter_map(Result::ok).take(200) {
        let path = entry.path();
        if entry.file_type().is_ok_and(|kind| kind.is_symlink())
            || !path.is_dir()
            || path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with('.'))
        {
            continue;
        }
        let initialized = path.join(".magent").is_dir()
            || path.join(".agents").is_dir()
            || path.join("pyproject.toml").is_file()
            || path.join("package.json").is_file()
            || path.join("Cargo.toml").is_file();
        if !initialized {
            continue;
        }
        let path = path.canonicalize().map_err(|error| error.to_string())?;
        let text = path.to_string_lossy().to_string();
        projects.push(AdjacentProject {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            current: path == root,
            launch_command: format!("mag-command-center --project {}", shell_display(&text)),
            path: text,
        });
    }
    projects.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
    });
    Ok(projects)
}

fn shell_display(value: &str) -> String {
    if value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "/._-".contains(character))
    {
        value.to_string()
    } else {
        format!("'{}'", value.replace('\'', "'\\''"))
    }
}

#[tauri::command]
pub fn preview_workspace_file(project: String, path: String) -> Result<WorkspacePreview, String> {
    let root = root(&project)?;
    let path = confined(&root, &path, true)?;
    if !path.is_file() {
        return Err("file not found".to_string());
    }
    let size = fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len();
    if size as usize > MAX_FILE_BYTES {
        return Err("file is larger than the 5 MiB preview limit".to_string());
    }
    let data = fs::read(&path).map_err(|error| error.to_string())?;
    let (mime, text, _) = mime_for(&path);
    let relative = path
        .strip_prefix(&root)
        .map_err(|error| error.to_string())?;
    Ok(WorkspacePreview {
        path: relative.to_string_lossy().replace('\\', "/"),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        size,
        mime: mime.to_string(),
        text,
        content: text.then(|| String::from_utf8_lossy(&data).to_string()),
        data_url: (!text).then(|| format!("data:{mime};base64,{}", BASE64.encode(&data))),
        truncated: false,
    })
}

#[tauri::command]
pub fn upload_workspace_file(
    project: String,
    request: UploadRequest,
) -> Result<WorkspaceFile, String> {
    let root = root(&project)?;
    let name = Path::new(&request.name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty() && *value != "." && *value != "..")
        .ok_or_else(|| "upload filename is invalid".to_string())?;
    if request.data_base64.len() > MAX_FILE_BYTES * 2 {
        return Err("uploads are limited to 5 MiB".to_string());
    }
    let data = BASE64
        .decode(request.data_base64)
        .map_err(|_| "upload data is not valid base64".to_string())?;
    if data.len() > MAX_FILE_BYTES {
        return Err("uploads are limited to 5 MiB".to_string());
    }
    let session = request
        .session_id
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || "_.-".contains(value) {
                value
            } else {
                '_'
            }
        })
        .take(80)
        .collect::<String>();
    let relative = PathBuf::from(".magent")
        .join("attachments")
        .join(if session.is_empty() {
            "shared"
        } else {
            &session
        })
        .join(name);
    let target = confined(&root, &relative.to_string_lossy(), true)?;
    fs::create_dir_all(
        target
            .parent()
            .ok_or_else(|| "upload path is invalid".to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::write(&target, &data).map_err(|error| error.to_string())?;
    let (mime, _, artifact) = mime_for(&target);
    Ok(WorkspaceFile {
        path: relative.to_string_lossy().replace('\\', "/"),
        name: name.to_string(),
        size: data.len() as u64,
        mime: mime.to_string(),
        artifact,
    })
}

#[tauri::command]
pub fn build_workspace_context(
    project: String,
    paths: Vec<String>,
) -> Result<WorkspaceContext, String> {
    let root = root(&project)?;
    if paths.len() > MAX_CONTEXT_FILES {
        return Err(format!(
            "select no more than {MAX_CONTEXT_FILES} context files"
        ));
    }
    let mut blocks = Vec::new();
    let mut references = Vec::new();
    let mut inline_bytes = 0;
    for raw in paths {
        let path = confined(&root, &raw, true)?;
        if !path.is_file() {
            return Err(format!("context file not found: {raw}"));
        }
        let size = fs::metadata(&path)
            .map_err(|error| error.to_string())?
            .len();
        let relative = path
            .strip_prefix(&root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let (_, text, _) = mime_for(&path);
        let inline = text
            && size as usize <= MAX_INLINE_BYTES
            && inline_bytes + size as usize <= MAX_CONTEXT_BYTES;
        if inline {
            let content = fs::read_to_string(&path).unwrap_or_else(|_| {
                String::from_utf8_lossy(&fs::read(&path).unwrap_or_default()).to_string()
            });
            blocks.push(format!("### {relative}\n```\n{content}\n```"));
            inline_bytes += size as usize;
        } else {
            blocks.push(format!(
                "- `{relative}` (confined workspace file; inspect with tools if needed)"
            ));
        }
        references.push(ContextReference {
            path: relative,
            size,
            inline,
        });
    }
    let prompt = if blocks.is_empty() {
        String::new()
    } else {
        format!(
            "\n\n# User-selected workspace context\n\n{}",
            blocks.join("\n\n")
        )
    };
    Ok(WorkspaceContext {
        prompt,
        references,
        inline_bytes,
    })
}

fn bounded(value: Vec<u8>) -> String {
    let start = value.len().saturating_sub(MAX_OUTPUT_BYTES);
    String::from_utf8_lossy(&value[start..]).to_string()
}

fn read_bounded(mut stream: impl Read) -> Vec<u8> {
    let mut retained = Vec::with_capacity(MAX_OUTPUT_BYTES);
    let mut chunk = [0_u8; 8 * 1024];
    loop {
        let Ok(read) = stream.read(&mut chunk) else {
            break;
        };
        if read == 0 {
            break;
        }
        retained.extend_from_slice(&chunk[..read]);
        if retained.len() > MAX_OUTPUT_BYTES {
            let overflow = retained.len() - MAX_OUTPUT_BYTES;
            retained.drain(..overflow);
        }
    }
    retained
}

fn run(mut command: Command, timeout: Duration) -> ProcessResult {
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    let Ok(mut child) = command.spawn() else {
        return ProcessResult {
            ok: false,
            status: None,
            stdout: String::new(),
            stderr: "command could not be started".to_string(),
            timed_out: false,
        };
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_reader = thread::spawn(move || {
        if let Some(mut stream) = stdout {
            return read_bounded(&mut stream);
        }
        Vec::new()
    });
    let stderr_reader = thread::spawn(move || {
        if let Some(mut stream) = stderr {
            return read_bounded(&mut stream);
        }
        Vec::new()
    });
    let started = Instant::now();
    let (status, timed_out) = loop {
        match child.try_wait() {
            Ok(Some(status)) => break (Some(status), false),
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(25)),
            Ok(None) => {
                let _ = child.kill();
                let status = child.wait().ok();
                break (status, true);
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return ProcessResult {
                    ok: false,
                    status: None,
                    stdout: String::new(),
                    stderr: error.to_string(),
                    timed_out: false,
                };
            }
        }
    };
    let stdout = bounded(stdout_reader.join().unwrap_or_default());
    let mut stderr = bounded(stderr_reader.join().unwrap_or_default());
    if timed_out {
        if !stderr.is_empty() && !stderr.ends_with('\n') {
            stderr.push('\n');
        }
        stderr.push_str("command timed out");
    }
    ProcessResult {
        ok: status.as_ref().is_some_and(|value| value.success()) && !timed_out,
        status: if timed_out {
            Some(124)
        } else {
            status.and_then(|value| value.code())
        },
        stdout,
        stderr,
        timed_out,
    }
}

fn git(root: &Path, args: &[&str], timeout: Duration) -> ProcessResult {
    let mut command = Command::new("git");
    command.current_dir(root).arg("--no-pager").args(args);
    run(command, timeout)
}

fn parse_worktrees(text: &str, root: &Path) -> Vec<GitWorktree> {
    let mut records = Vec::new();
    let mut worktree = String::new();
    let mut head = None;
    let mut branch = None;
    let mut detached = false;
    for line in text.lines().chain(std::iter::once("")) {
        if line.is_empty() {
            if !worktree.is_empty() {
                records.push(GitWorktree {
                    current: Path::new(&worktree).canonicalize().ok().as_ref()
                        == Some(&root.to_path_buf()),
                    worktree: std::mem::take(&mut worktree),
                    head: head.take(),
                    branch: branch.take(),
                    detached,
                });
                detached = false;
            }
            continue;
        }
        let (key, value) = line.split_once(' ').unwrap_or((line, ""));
        match key {
            "worktree" => worktree = value.to_string(),
            "HEAD" => head = Some(value.to_string()),
            "branch" => branch = Some(value.trim_start_matches("refs/heads/").to_string()),
            "detached" => detached = true,
            _ => {}
        }
    }
    records
}

#[tauri::command]
pub fn workspace_git_state(project: String) -> Result<GitState, String> {
    let root = root(&project)?;
    let status = git(
        &root,
        &["status", "--short", "--branch"],
        Duration::from_secs(30),
    );
    let branches = git(
        &root,
        &["branch", "--format=%(refname:short)"],
        Duration::from_secs(30),
    );
    let worktrees = git(
        &root,
        &["worktree", "list", "--porcelain"],
        Duration::from_secs(30),
    );
    let current = git(
        &root,
        &["branch", "--show-current"],
        Duration::from_secs(30),
    );
    Ok(GitState {
        ok: status.ok,
        status: status.stdout.lines().map(ToString::to_string).collect(),
        branches: branches.stdout.lines().map(ToString::to_string).collect(),
        current_branch: current.stdout.trim().to_string(),
        worktrees: parse_worktrees(&worktrees.stdout, &root),
        error: status.stderr,
    })
}

#[tauri::command]
pub fn workspace_git_diff(project: String, staged: bool) -> Result<ProcessResult, String> {
    let root = root(&project)?;
    Ok(git(
        &root,
        if staged {
            &["diff", "--cached"]
        } else {
            &["diff"]
        },
        Duration::from_secs(30),
    ))
}

#[tauri::command]
pub fn workspace_git_action(
    project: String,
    action: String,
    path: String,
) -> Result<ProcessResult, String> {
    let root = root(&project)?;
    let path = confined(&root, &path, false)?;
    let relative = path
        .strip_prefix(&root)
        .map_err(|error| error.to_string())?
        .to_string_lossy();
    let args = match action.as_str() {
        "stage" => vec!["add", "--", relative.as_ref()],
        "unstage" => vec!["restore", "--staged", "--", relative.as_ref()],
        "discard" => vec!["restore", "--worktree", "--", relative.as_ref()],
        _ => return Err("unsupported git action".to_string()),
    };
    Ok(git(&root, &args, Duration::from_secs(30)))
}

fn safe_branch(branch: &str) -> bool {
    !branch.is_empty()
        && branch.len() <= 128
        && !branch
            .chars()
            .next()
            .is_some_and(|value| matches!(value, '-' | '/' | '.'))
        && !branch
            .chars()
            .last()
            .is_some_and(|value| matches!(value, '/' | '.'))
        && !branch.contains("..")
        && !branch.contains("//")
        && !branch.contains("@{")
        && !branch.ends_with(".lock")
        && branch
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || "._/-".contains(value))
}

#[tauri::command]
pub fn workspace_create_worktree(
    project: String,
    branch: String,
    directory: String,
    create_branch: bool,
) -> Result<ProcessResult, String> {
    let root = root(&project)?;
    if !safe_branch(&branch) {
        return Err("branch name is invalid".to_string());
    }
    let parent = root
        .parent()
        .ok_or_else(|| "workspace has no parent".to_string())?;
    let target = if Path::new(&directory).is_absolute() {
        PathBuf::from(directory)
    } else {
        parent.join(directory)
    };
    let canonical_parent = target
        .parent()
        .ok_or_else(|| "worktree directory is invalid".to_string())?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let target = canonical_parent.join(
        target
            .file_name()
            .ok_or_else(|| "worktree directory is invalid".to_string())?,
    );
    if !target.starts_with(parent) || target == root || target == parent {
        return Err("worktrees must stay beside or inside the selected workspace".to_string());
    }
    let target_text = target.to_string_lossy();
    let args = if create_branch {
        vec![
            "worktree",
            "add",
            "-b",
            branch.as_str(),
            target_text.as_ref(),
        ]
    } else {
        vec!["worktree", "add", target_text.as_ref(), branch.as_str()]
    };
    Ok(git(&root, &args, Duration::from_secs(120)))
}

#[tauri::command]
pub fn workspace_remove_worktree(
    project: String,
    directory: String,
) -> Result<ProcessResult, String> {
    let root = root(&project)?;
    let target = PathBuf::from(directory)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if target == root
        || !target.starts_with(
            root.parent()
                .ok_or_else(|| "workspace has no parent".to_string())?,
        )
    {
        return Err("cannot remove this worktree".to_string());
    }
    Ok(git(
        &root,
        &["worktree", "remove", target.to_string_lossy().as_ref()],
        Duration::from_secs(120),
    ))
}

#[tauri::command]
pub fn run_workspace_command(
    project: String,
    argv: Vec<String>,
    timeout_seconds: u64,
) -> Result<ProcessResult, String> {
    let root = root(&project)?;
    if argv.is_empty()
        || argv.len() > 128
        || argv
            .iter()
            .any(|item| item.len() > 4_000 || item.contains('\0'))
    {
        return Err("command arguments are invalid".to_string());
    }
    let mut command = Command::new(&argv[0]);
    command
        .current_dir(root)
        .args(&argv[1..])
        .env("PAGER", "cat")
        .env("GIT_PAGER", "cat");
    Ok(run(
        command,
        Duration::from_secs(timeout_seconds.clamp(1, 120)),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn branch_validation_rejects_ambiguous_names() {
        assert!(safe_branch("feature/workspace-ui"));
        assert!(!safe_branch("../outside"));
        assert!(!safe_branch("feature workspace"));
        assert!(!safe_branch("-danger"));
        assert!(!safe_branch("feature.lock"));
        assert!(!safe_branch("feature@{old"));
    }

    #[test]
    fn worktree_parser_preserves_current_and_detached_state() {
        let root = PathBuf::from("/tmp/project");
        let records = parse_worktrees(
            "worktree /tmp/project\nHEAD abc\nbranch refs/heads/main\n\nworktree /tmp/other\nHEAD def\ndetached\n",
            &root,
        );
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].branch.as_deref(), Some("main"));
        assert!(records[1].detached);
    }

    #[test]
    fn bounded_reader_retains_only_the_output_tail() {
        let payload = vec![b'x'; MAX_OUTPUT_BYTES + 4096];
        let retained = read_bounded(payload.as_slice());
        assert_eq!(retained.len(), MAX_OUTPUT_BYTES);
        assert!(retained.iter().all(|byte| *byte == b'x'));
    }
}
