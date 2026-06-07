# Project Workspace MVP

This milestone turns Mag Command Center from a planning scaffold into a usable desktop cockpit over the MagAgent CLI.

## Implemented Surfaces

- First-time setup wizard for MagAgent detection, minimum version checks, and guided install/upgrade with restricted bootstrap commands.
- Project dashboard for active project path, native folder picking, pinned/recent projects, MagAgent detection, readiness checks, project health, and last command output.
- Agent chat over `magent ask --json --events`, with per-project chat history persisted in browser storage, quick prompts, running status, and event timeline rendering.
- Deep research over `magent research`, including summaries and source tables.
- Config workbench over `magent config schema`, `magent config get`, and `magent config set`, with dynamic guided setup categories.
- Memory workbench over `magent memory graph`, `memory node`, `memory update-node --preview`, `memory update-node`, `memory suppress`, `memory unsuppress`, and `memory merge`, plus graph preview, provenance/backlink summary, and chat handoff for memory improvement.
- SQLite explorer over `magent data sqlite-list`, `sqlite-tables`, and `sqlite-query`, with table rendering for row-shaped payloads.
- Plugin inventory cards, install, import, enable, and disable actions over `magent plugin`.
- Session/workbench surface for recipe listing/running, patch inspection, and desktop command history.
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

The setup wizard uses a separate restricted bridge that only allows MagAgent bootstrap commands. It does not expose general-purpose shell execution.

## Current Limits

- True token-by-token streaming still needs a long-running process/event bridge. Current chat shows running state immediately and structured events when the CLI returns.
- Workbench recipe and patch commands are surfaced optimistically; unavailable MagAgent commands are shown in command output instead of hiding failures.
- Memory inbox review can build on the current node editor, graph preview, and memory APIs.
- Plugin install/import actions exist, but richer permission/capability review should be added before marketplace-style workflows.

## Next UX Targets

- True streaming process bridge for chat and long-running recipes.
- Memory inbox review flows.
- SQLite table browsing with pagination.
- Plugin permission/capability review before install/import.
