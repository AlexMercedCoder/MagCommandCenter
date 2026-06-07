# Mag Command Center 0.1.0 Release Notes

Mag Command Center is the desktop cockpit for MagAgent. It provides a project-first UI over the installed `magent` CLI, sharing the same MagAgent configuration, memory, SQLite data, skills, and plugins that terminal workflows use.

## Highlights

- First-run Setup tab with MagAgent detection, version checks, install/upgrade actions, and setup diagnostics.
- Multi-project launcher with pinned/recent projects, folder picker, project health inspection, git dirty-file count, detected stacks, and suggested test commands.
- Project-scoped agent chat with named sessions, local per-project history, quick prompts, live stdout/stderr streaming, and structured event timelines.
- Deep research panel through `magent research`.
- Guided configuration UI backed by `magent config schema`.
- Memory explorer for MagGraph nodes, backlinks, provenance, inbox review, suppress/unsuppress, merge, preview/apply edits, and handoff to chat for memory improvement.
- SQLite explorer for MagAgent databases, tables, paged read-only queries, saved queries, and JSON/CSV export text.
- Plugin manager for installed plugins, safety review, import/install, enable, and disable flows.
- Workbench view for recipes, patch inspection, and command history.
- In-app documentation for setup, projects, chat, config, memory, SQLite, plugins, and packaging.

## Requirements

- MagAgent `0.30.0+` is recommended.
- Linux builds require WebKit/GTK runtime libraries provided by the target distribution.
- The desktop app shells out to `magent`; custom MagAgent installs can be selected by launching with `MAGENT_BIN=/path/to/magent`.

## Artifacts

- Linux `.deb`
- Linux `.rpm`
- macOS Apple Silicon `.dmg` and `.app`
- Windows NSIS `.exe`
- Windows `.msi`

## Known Distribution Notes

- 0.1.0 artifacts are unsigned.
- macOS may show Gatekeeper warnings until Developer ID signing and notarization are configured.
- Windows may show SmartScreen warnings until code signing is configured and reputation develops.
- In-app updates are not enabled yet; updater support should wait for signed updater artifacts and a stable update endpoint.

## Verification

The release workflow runs frontend tests, frontend build, Rust tests, Rust check, platform-native desktop packaging, artifact upload, and draft release asset publication for `v*` tags.
