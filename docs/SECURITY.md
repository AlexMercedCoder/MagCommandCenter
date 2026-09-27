# Security model

Mag Command Center is a local-first control surface over an installed MagAgent CLI. MagAgent remains the authority for provider credentials, OAP permissions, tool approval, graph execution, plugins, and durable task records.

## Boundaries

- The setup bridge exposes only its documented MagAgent/pipx bootstrap allowlist.
- General MagAgent invocations are fixed command/argument arrays; project paths are explicit arguments.
- Workspace operations canonicalize the selected project and candidate path, reject traversal and symlink escape, hide internal `.magent` state except attachments, and cap data returned to the renderer.
- The workspace command runner invokes a program directly without a shell, enforces a timeout, drains both output streams concurrently, and truncates output. Only read-only Git and common test/lint/build commands run without asking; any other program (or explicit path) needs a per-project approval given in a native dialog, stored where the renderer cannot write (`src-tauri/src/command_policy.rs`).
- Editor handoff (`open_in_editor`) takes an editor name from a fixed list, never an executable; the file must canonicalize to an existing regular file inside the active project. `$VISUAL`/`$EDITOR` is read natively and terminal editors are refused. Agent prompts for Loro go in an owner-only (0600) temp file passed with `--prompt-file` and deleted after the run, not on the command line.
- Destructive Git and worktree operations require user confirmation in the renderer and are revalidated natively.
- Provider credentials are never persisted by Command Center (they are piped to MagAgent on stdin) or included in diagnostics. A remote gateway token is kept in native memory while connected and, only if you tick Remember, in the OS credential store under the gateway host; it is never written to app state, localStorage, or diagnostics. Remote mode is experimental and hidden unless enabled in Settings > Experimental features.
- Stop and app exit terminate the whole process tree a run started (process group on macOS and Linux, Job Object on Windows), so cancelled agent work cannot keep running tools in the background.
- CI jobs run with a read-only `GITHUB_TOKEN`. Only the tag-gated publish job receives `contents: write`, `id-token: write`, and `attestations: write`.
- Renderer capabilities are `core:default`, `dialog:allow-open`, and the two notification permission checks (`notification:allow-is-permission-granted`, `notification:allow-request-permission`). Notifications themselves are sent from Rust, so the renderer cannot post arbitrary OS notifications.
- The Tauri content-security policy permits packaged scripts only and allows network connections only to IPC. The experimental remote runtime is reached through a native proxy that talks only to a host the user confirmed in a native dialog, and keeps the token out of the renderer.

## Stored data and recovery

UI state lives in the platform app-data `command-center.sqlite3` database. Schema migrations are recorded. Upgrading from any older schema (for example schema 2 from 1.0.0-rc.5) first checkpoints WAL state and creates `command-center.v<old>.sqlite3.backup` beside the database. CI installs the previous release, seeds this database, installs the new build over it, and verifies the data survived (see [RELEASE_BUILDS.md](RELEASE_BUILDS.md)). Project chat, schedules, shortcuts, and preferences are stored as JSON values; project source and MagAgent data remain in their original locations.

## Reporting and release verification

Report vulnerabilities privately through the repository security advisory flow. Do not include provider keys, access tokens, private prompts, or project contents. Tagged CI attaches `SHA256SUMS`, CycloneDX SBOMs for the frontend and the native crates, and GitHub build-provenance attestations to every release. Verify a download with `sha256sum -c SHA256SUMS --ignore-missing` and `gh attestation verify <file> --repo AlexMercedCoder/MagCommandCenter`.

macOS signing and notarization and Windows code signing run automatically once their secrets are added (see [RELEASE_BUILDS.md](RELEASE_BUILDS.md)). Until then those installers are unsigned, and each release's notes state the signing status per platform.
