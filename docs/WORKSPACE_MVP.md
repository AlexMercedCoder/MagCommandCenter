# Project Workspace MVP

This milestone turns Mag Command Center from a planning scaffold into a usable desktop cockpit over the MagAgent CLI.

## Implemented Surfaces

- Dashboard for active project path, native folder picking, recent projects, MagAgent detection, readiness checks, and last command output.
- Agent chat over `magent ask --json`, with per-project chat history persisted in browser storage.
- Config workbench over `magent config get` and `magent config set`, with guided controls for provider, model, permission mode, memory auto-write, and subagent cap.
- Memory workbench over `magent memory graph`, `memory node`, `memory suppress`, `memory unsuppress`, and `memory merge`.
- SQLite explorer over `magent data sqlite-list`, `sqlite-tables`, and `sqlite-query`, with table rendering for row-shaped payloads.
- Plugin inventory and enable/disable actions over `magent plugin list`, `plugin enable`, and `plugin disable`.
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

- Plugin install/import workflows remain future work. They should use native folder picking and structured MagAgent command output before becoming primary actions.
- Memory body/frontmatter editing is not yet exposed. The next pass should support safe node improvement and inbox review flows once those APIs are shaped for desktop use.
- Chat output is still request/response instead of streaming event timelines.

## Next UX Targets

- Plugin install/import actions.
- Memory node edit, improvement, and inbox flows.
- SQLite table browsing with pagination.
- Streamed chat output and tool/action timeline rendering.
