//! Editor handoff for diff and checkpoint review (Phase 6).
//!
//! The renderer can only pick from a closed set of editors and pass a file inside the
//! active project; the executable is never renderer-supplied. `environment` uses the
//! user's own `$VISUAL`/`$EDITOR`, which the renderer cannot change.
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Editor {
    Auto,
    VsCode,
    Cursor,
    Zed,
    Environment,
    System,
}

impl Editor {
    pub fn parse(value: &str) -> Result<Self, String> {
        Ok(match value {
            "auto" => Editor::Auto,
            "vscode" => Editor::VsCode,
            "cursor" => Editor::Cursor,
            "zed" => Editor::Zed,
            "environment" => Editor::Environment,
            "system" => Editor::System,
            other => return Err(format!("Unknown editor `{other}`.")),
        })
    }
}

const TERMINAL_EDITORS: &[&str] = &[
    "vi", "vim", "nvim", "nano", "micro", "hx", "helix", "kak", "ed", "emacs", "joe", "mg",
];

fn on_path(program: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&paths) {
        for name in [
            program.to_string(),
            format!("{program}.cmd"),
            format!("{program}.exe"),
        ] {
            let candidate = directory.join(&name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// The editor command from `$VISUAL`/`$EDITOR`, unless it needs a terminal.
pub fn environment_editor(
    visual: Option<String>,
    editor: Option<String>,
) -> Result<Vec<String>, String> {
    let value = visual
        .filter(|value| !value.trim().is_empty())
        .or(editor.filter(|value| !value.trim().is_empty()))
        .ok_or_else(|| "Neither $VISUAL nor $EDITOR is set.".to_string())?;
    let parts: Vec<String> = value.split_whitespace().map(str::to_string).collect();
    let program = Path::new(&parts[0])
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&parts[0])
        .to_ascii_lowercase();
    let gui_emacs = program == "emacs" && !parts.iter().any(|arg| arg == "-nw");
    if TERMINAL_EDITORS.contains(&program.as_str()) && !(gui_emacs && program == "emacs") {
        return Err(format!(
            "`{program}` from $VISUAL/$EDITOR runs in a terminal, so it cannot open from Command Center. Choose VS Code, Cursor, Zed, or the system default in Settings > Editor."
        ));
    }
    Ok(parts)
}

/// File types that OS "open" handlers run instead of display (Linux, macOS, Windows).
const LAUNCHABLE: &[&str] = &[
    "desktop",
    "app",
    "command",
    "tool",
    "terminal",
    "workflow",
    "scpt",
    "applescript",
    "sh",
    "bash",
    "zsh",
    "ksh",
    "csh",
    "fish",
    "run",
    "bin",
    "appimage",
    "jar",
    "exe",
    "com",
    "bat",
    "cmd",
    "ps1",
    "psm1",
    "vbs",
    "vbe",
    "js",
    "jse",
    "wsf",
    "wsh",
    "hta",
    "msi",
    "msp",
    "scr",
    "cpl",
    "lnk",
    "url",
    "pif",
    "reg",
    "inf",
    "application",
    "appref-ms",
    "py",
    "pyw",
    "pl",
    "rb",
    "deb",
    "rpm",
    "pkg",
    "dmg",
];

/// True when the system opener would run `file` rather than show it: a launcher or
/// script type, or (on Unix) any file with an execute bit.
pub fn launchable(file: &Path) -> bool {
    let by_type = file
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| LAUNCHABLE.contains(&value.to_ascii_lowercase().as_str()))
        .unwrap_or(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let executable = std::fs::metadata(file)
            .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
        by_type || executable
    }
    #[cfg(not(unix))]
    {
        by_type
    }
}

/// The program and arguments that open `file` at `line`.
pub fn command_for(
    editor: Editor,
    file: &Path,
    line: Option<u32>,
    has: impl Fn(&str) -> bool,
    env_editor: impl Fn() -> Result<Vec<String>, String>,
) -> Result<Vec<String>, String> {
    let file_text = file.display().to_string();
    let at = match line {
        Some(line) if line > 0 => format!("{file_text}:{line}"),
        _ => file_text.clone(),
    };
    let resolved = match editor {
        Editor::Auto => {
            if has("code") {
                Editor::VsCode
            } else if has("cursor") {
                Editor::Cursor
            } else if has("zed") {
                Editor::Zed
            } else if env_editor().is_ok() {
                Editor::Environment
            } else {
                Editor::System
            }
        }
        other => other,
    };
    Ok(match resolved {
        Editor::VsCode => vec!["code".into(), "--goto".into(), at],
        Editor::Cursor => vec!["cursor".into(), "--goto".into(), at],
        Editor::Zed => vec!["zed".into(), at],
        Editor::Environment => {
            let mut parts = env_editor()?;
            parts.push(file_text);
            parts
        }
        Editor::System | Editor::Auto => {
            if launchable(file) {
                return Err(format!(
                    "{} could run as a program if opened with the system default, so it was not opened. Choose VS Code, Cursor, or Zed in Settings > Editor to view it as text.",
                    file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()
                ));
            }
            if cfg!(target_os = "macos") {
                vec!["open".into(), file_text]
            } else if cfg!(windows) {
                vec!["explorer.exe".into(), file_text]
            } else {
                vec!["xdg-open".into(), file_text]
            }
        }
    })
}

/// A path the user may open: an existing file inside the project.
pub fn confined_file(project: &str, path: &str) -> Result<PathBuf, String> {
    let root = std::fs::canonicalize(project).map_err(|error| error.to_string())?;
    let requested = PathBuf::from(path);
    let candidate = if requested.is_absolute() {
        requested
    } else {
        root.join(requested)
    };
    let file = std::fs::canonicalize(&candidate)
        .map_err(|_| format!("{} no longer exists.", candidate.display()))?;
    if !file.starts_with(&root) || !file.is_file() {
        return Err("Only files inside the active project can be opened.".to_string());
    }
    Ok(file)
}

#[tauri::command]
pub fn open_in_editor(
    project: String,
    path: String,
    line: Option<u32>,
    editor: String,
) -> Result<String, String> {
    let choice = Editor::parse(&editor)?;
    let file = confined_file(&project, &path)?;
    let argv = command_for(
        choice,
        &file,
        line,
        |program| on_path(program).is_some(),
        || environment_editor(std::env::var("VISUAL").ok(), std::env::var("EDITOR").ok()),
    )?;
    Command::new(&argv[0])
        .args(&argv[1..])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start {}: {error}", argv[0]))?;
    Ok(argv[0].clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn none(_: &str) -> bool {
        false
    }

    #[test]
    fn editors_open_at_the_line() {
        let file = Path::new("/p/src/app.ts");
        let no_env = || Err("unset".to_string());
        assert_eq!(
            command_for(Editor::VsCode, file, Some(12), none, no_env).unwrap(),
            vec!["code", "--goto", "/p/src/app.ts:12"]
        );
        assert_eq!(
            command_for(Editor::Zed, file, None, none, no_env).unwrap(),
            vec!["zed", "/p/src/app.ts"]
        );
        assert_eq!(
            command_for(Editor::Auto, file, Some(3), |p| p == "cursor", no_env).unwrap()[0],
            "cursor"
        );
        let system = command_for(Editor::Auto, file, None, none, no_env).unwrap();
        assert!(["xdg-open", "open", "explorer.exe"].contains(&system[0].as_str()));
    }

    /// The system opener runs launchers and executables instead of showing them, so a
    /// file an agent wrote (for example `setup.desktop` or `run.bat`) must not be handed to
    /// it; code editors still open such files as text.
    #[test]
    fn the_system_opener_refuses_files_it_would_run() {
        let root = std::env::temp_dir().join(format!("mcc-editor-launch-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let no_env = || Err("unset".to_string());
        for name in [
            "setup.desktop",
            "run.bat",
            "tool.command",
            "x.lnk",
            "app.exe",
            "s.ps1",
        ] {
            let file = root.join(name);
            std::fs::write(&file, "x").unwrap();
            assert!(
                command_for(Editor::System, &file, None, none, no_env).is_err(),
                "{name} must not reach the system opener"
            );
            assert!(command_for(Editor::Auto, &file, None, none, no_env).is_err());
            assert_eq!(
                command_for(Editor::VsCode, &file, None, none, no_env).unwrap()[0],
                "code"
            );
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let script = root.join("build");
            std::fs::write(&script, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
            assert!(command_for(Editor::System, &script, None, none, no_env).is_err());
        }
        let text = root.join("notes.md");
        std::fs::write(&text, "x").unwrap();
        assert!(command_for(Editor::System, &text, None, none, no_env).is_ok());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn environment_editor_rejects_terminal_editors() {
        assert!(environment_editor(None, Some("vim".into())).is_err());
        assert!(environment_editor(Some("emacs -nw".into()), None).is_err());
        assert_eq!(
            environment_editor(Some("subl -w".into()), Some("vim".into())).unwrap(),
            vec!["subl", "-w"]
        );
        assert!(environment_editor(None, None).is_err());
    }

    #[test]
    fn only_files_inside_the_project_open() {
        let root = std::env::temp_dir().join(format!("mcc-editor-{}", std::process::id()));
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/a.txt"), "x").unwrap();
        let project = root.display().to_string();
        assert!(confined_file(&project, "src/a.txt").is_ok());
        assert!(confined_file(&project, &root.join("src/a.txt").display().to_string()).is_ok());
        assert!(confined_file(&project, "../../etc/passwd").is_err());
        assert!(confined_file(&project, "src").is_err());
        assert!(confined_file(&project, "missing.txt").is_err());
        assert!(Editor::parse("sh").is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
