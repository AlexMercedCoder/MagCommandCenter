# Project Workspace MVP

This milestone turns Mag Command Center from a planning scaffold into a usable desktop cockpit over the MagAgent CLI.

## Implemented Surfaces

- Dashboard for active project path, native folder picking, recent projects, MagAgent detection, readiness checks, and last command output.
- Agent chat over `magent ask --json --events`, with per-project chat history persisted in browser storage and event timeline rendering.
- Deep research over `magent research`, including summaries and source tables.
- Config workbench over `magent config schema`, `magent config get`, and `magent config set`, with dynamic guided controls.
- Memory workbench over `magent memory graph`, `memory node`, `memory update-node --preview`, `memory update-node`, `memory suppress`, `memory unsuppress`, and `memory merge`.
- SQLite explorer over `magent data sqlite-list`, `sqlite-tables`, and `sqlite-query`, with table rendering for row-shaped payloads.
- Plugin inventory, install, import, enable, and disable actions over `magent plugin`.
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

- Streaming chat is still future work; current chat uses structured request/response event records.
- Memory improvement prompts and inbox review can build on the current node editor and memory APIs.
- Plugin install/import actions exist, but richer permission/capability review should be added before marketplace-style workflows.

## Next UX Targets

- Memory improvement and inbox review flows.
- SQLite table browsing with pagination.
- Streamed chat output.
- Plugin permission/capability review before install/import.
