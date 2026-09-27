//! Git without repository-configured programs (SEC-1).
//!
//! A repository's own `.git/config` can name programs that Git runs during ordinary
//! read-only commands: `core.fsmonitor` on `status`, `diff.external` and textconv drivers
//! on `diff`/`log`/`show`, filter drivers on `status`/`add`/checkout, hooks on
//! `worktree add`, and `gpg.program` when `log.showSignature` is set. An agent working in
//! the project can write that file, so every Git process Command Center starts overrides
//! those settings on the command line (which outranks every config file and is inherited
//! by nested Git processes) and asks diff-producing commands not to run helpers.
use std::path::Path;
use std::process::{Command, Stdio};

#[cfg(windows)]
const NO_HOOKS: &str = "NUL";
#[cfg(not(windows))]
const NO_HOOKS: &str = "/dev/null";

/// Settings that would otherwise let repository config run a program.
pub fn fixed_overrides() -> Vec<(String, String)> {
    [
        ("core.fsmonitor", "false"),
        ("core.hooksPath", NO_HOOKS),
        ("diff.external", ""),
        ("log.showSignature", "false"),
        ("core.pager", "cat"),
        // Submodules carry their own config; do not descend into them.
        ("diff.ignoreSubmodules", "all"),
        ("submodule.recurse", "false"),
    ]
    .into_iter()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect()
}

/// Filter drivers defined in the repository's own config (including files it includes).
/// Drivers from the user's global or system config are the user's choice and stay active.
pub fn repository_filters(root: &Path) -> Vec<String> {
    let mut names = Vec::new();
    for scope in ["--local", "--worktree"] {
        let mut command = Command::new("git");
        command.current_dir(root);
        for (key, value) in fixed_overrides() {
            command.arg("-c").arg(format!("{key}={value}"));
        }
        let Ok(output) = command
            .args(["config", scope, "--includes", "--get-regexp", r"^filter\."])
            .stdin(Stdio::null())
            .output()
        else {
            continue;
        };
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let key = line.split_whitespace().next().unwrap_or_default();
            // filter.<name>.<setting>; the name itself may contain dots.
            if let Some(rest) = key.strip_prefix("filter.") {
                if let Some((name, _)) = rest.rsplit_once('.') {
                    if !name.is_empty() && !names.iter().any(|n| n == name) {
                        names.push(name.to_string());
                    }
                }
            }
        }
    }
    names
}

/// `-c key=value` arguments that neutralize repository-configured programs in `root`.
pub fn config_args(root: &Path) -> Vec<String> {
    let mut pairs = fixed_overrides();
    for name in repository_filters(root) {
        for setting in ["clean", "smudge", "process"] {
            pairs.push((format!("filter.{name}.{setting}"), String::new()));
        }
        pairs.push((format!("filter.{name}.required"), "false".to_string()));
    }
    pairs
        .into_iter()
        .flat_map(|(key, value)| ["-c".to_string(), format!("{key}={value}")])
        .collect()
}

/// Flags that stop a diff-producing subcommand from running external diff or textconv
/// helpers. Empty for subcommands that do not produce diffs.
pub fn helper_flags(subcommand: &str) -> &'static [&'static str] {
    match subcommand {
        "diff" | "log" | "show" => &["--no-ext-diff", "--no-textconv"],
        "blame" => &["--no-textconv"],
        _ => &[],
    }
}

/// A `git` command in `root` with repository-configured programs disabled. `args` starts
/// with the subcommand; helper flags are inserted right after it.
pub fn command(root: &Path, args: &[String]) -> Command {
    let mut command = Command::new("git");
    command
        .current_dir(root)
        .arg("--no-pager")
        .args(config_args(root))
        .env("GIT_PAGER", "cat")
        .env("PAGER", "cat");
    match args.split_first() {
        // Only a leading subcommand gets helper flags; global options are passed as-is.
        Some((subcommand, rest)) if !subcommand.starts_with('-') => {
            command.arg(subcommand);
            command.args(helper_flags(subcommand));
            command.args(rest);
        }
        _ => {
            command.args(args);
        }
    }
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helpers_are_disabled_for_diff_producing_commands() {
        assert_eq!(helper_flags("diff"), ["--no-ext-diff", "--no-textconv"]);
        assert_eq!(helper_flags("blame"), ["--no-textconv"]);
        assert!(helper_flags("status").is_empty());
        let built = command(Path::new("."), &["diff".into(), "--cached".into()]);
        let args: Vec<String> = built
            .get_args()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        let at = args.iter().position(|a| a == "diff").unwrap();
        assert_eq!(
            &args[at + 1..],
            ["--no-ext-diff", "--no-textconv", "--cached"]
        );
        assert!(args.contains(&"core.fsmonitor=false".to_string()));
        assert!(args.contains(&format!("core.hooksPath={NO_HOOKS}")));
    }
}
