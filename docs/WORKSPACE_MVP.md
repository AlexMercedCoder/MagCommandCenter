# Project Workspace MVP

This milestone turns Mag Command Center from a planning scaffold into a usable desktop cockpit over the MagAgent CLI.

## Implemented Surfaces

- Dashboard for active project path, recent projects, MagAgent detection, readiness checks, and last command output.
- Agent chat over `magent ask --json`, with per-project chat history persisted in browser storage.
- Config workbench over `magent config get` and `magent config set`.
- Memory workbench over `magent memory graph` and `magent memory node`.
- SQLite explorer over `magent data sqlite-list`, `sqlite-tables`, and `sqlite-query`.
- Plugin inventory over `magent plugin list`.
- Light and dark themes following the neubrutalist design guidance in `design.md`.

## Backend Contract

Mag Command Center continues to treat MagAgent as the backend source of truth. The Tauri bridge shells out to the installed `magent` binary and returns:

- command string
- stdout
- stderr
- process status
- success flag

The bridge resolves the binary in this order:

1. `MAGENT_BIN`
2. `$HOME/.pyenv/shims/magent`
3. `$HOME/.local/bin/magent`
4. `magent` on `PATH`

## Current Limits

- Project opening uses a typed path plus recent-project persistence. A native folder picker should be added with Tauri's dialog plugin.
- Config editing is intentionally direct: dot path plus JSON/string value. Future passes should add guided controls for common settings.
- Plugin management is read-only in the first MVP. Enable, disable, install, and import workflows should use structured MagAgent commands before becoming buttons.
- Memory editing is not yet exposed. The next pass should support safe node improvement, suppress, unsuppress, merge, and inbox flows.

## Next UX Targets

- Native folder picker.
- Structured provider/model settings forms.
- Memory node edit and improvement flows.
- SQLite table browsing with pagination.
- Plugin enable/disable/import actions.
- Streamed chat output and tool/action timeline rendering.
