# Project Workspace MVP

This milestone turns Mag Command Center from a planning scaffold into a usable desktop cockpit over the MagAgent CLI.

## Implemented Surfaces

- First-time setup wizard for MagAgent detection, minimum version checks, and guided install/upgrade with restricted bootstrap commands.
- Project dashboard for active project path, native folder picking, pinned/recent projects, MagAgent detection, readiness checks, project health, command count, and last command output.
- Agent chat over `magent ask --json --events`, with per-project/per-session chat history persisted in browser storage, quick prompts, running status, live stdout/stderr streaming, and event timeline rendering.
- Deep research over `magent research`, including summaries and source tables.
- Config workbench over `magent config schema`, `magent config get`, and `magent config set`, with dynamic guided setup categories.
- Memory workbench over `magent memory graph`, `memory inbox`, `memory node`, `memory update-node --preview`, `memory update-node`, `memory suppress`, `memory unsuppress`, and `memory merge`, plus graph preview, provenance/backlink summary, inbox accept/reject, and chat handoff for memory improvement.
- SQLite explorer over `magent data sqlite-list`, `sqlite-tables`, and `sqlite-query`, with table rendering for row-shaped payloads, page controls, and saved queries.
- Plugin inventory cards, safety review, install, import, enable, and disable actions over `magent plugin`.
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

Long-running commands can use `run_magent_stream`, which emits `magent-stream` events containing command id, stream name, and line content. The frontend uses this for chat today and can reuse it for recipes, research, and background jobs.

## Current Limits

- The desktop bridge streams process output line-by-line. Token-by-token model streaming still depends on MagAgent exposing token events through the CLI.
- Workbench recipe and patch commands are surfaced optimistically; unavailable MagAgent commands are shown in command output instead of hiding failures.
- Memory inbox review is available for accept/reject flows; richer edit-before-promote flows can build on the current node editor.
- Plugin install/import actions exist, but richer permission/capability review should be added before marketplace-style workflows.

## Next UX Targets

- Reuse the streaming bridge for research and recipes.
- Memory inbox edit-before-promote.
- SQLite schema details, export, and richer pagination.
- Plugin permission/capability diffing before install/import.
