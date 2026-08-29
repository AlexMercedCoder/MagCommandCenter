# Security model

Mag Command Center is a local-first control surface over an installed MagAgent CLI. MagAgent remains the authority for provider credentials, OAP permissions, tool approval, graph execution, plugins, and durable task records.

## Boundaries

- The setup bridge exposes only its documented MagAgent/pipx bootstrap allowlist.
- General MagAgent invocations are fixed command/argument arrays; project paths are explicit arguments.
- Workspace operations canonicalize the selected project and candidate path, reject traversal and symlink escape, hide internal `.magent` state except attachments, and cap data returned to the renderer.
- The workspace command runner invokes a program directly without a shell, enforces a timeout, drains both output streams concurrently, and truncates output.
- Destructive Git and worktree operations require user confirmation in the renderer and are revalidated natively.
- Remote tokens and provider credentials are never persisted or included in diagnostics.
- The Tauri content-security policy permits packaged scripts only and restricts network connections to HTTPS and loopback development.

## Stored data and recovery

UI state lives in the platform app-data `command-center.sqlite3` database. Schema migrations are recorded. Upgrading a v1 database to schema 2 first checkpoints WAL state and creates `command-center.v1.sqlite3.backup` beside the database. Project chat, schedules, shortcuts, and preferences are stored as JSON values; project source and MagAgent data remain in their original locations.

## Reporting and release verification

Report vulnerabilities privately through the repository security advisory flow. Do not include provider keys, access tokens, private prompts, or project contents. Tagged CI produces a CycloneDX frontend SBOM and GitHub build-provenance attestations. Verify artifacts against the matching GitHub release and attestation before installation.

Apple notarization and Windows code signing still require project credentials; unsigned-candidate warnings are documented in [DISTRIBUTION.md](DISTRIBUTION.md).
