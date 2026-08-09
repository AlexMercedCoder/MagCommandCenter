# Project Workspace MVP

This milestone turns Mag Command Center from a planning scaffold into a usable desktop cockpit over the MagAgent CLI.

## Implemented Surfaces

- First-time setup wizard for MagAgent detection, minimum version checks, and guided install/upgrade with restricted bootstrap commands.
- Project dashboard for active project path, native folder picking, pinned/recent projects, MagAgent detection, readiness checks, richer project health inspection, command count, and last command output.
- Agent chat over durable `magent.task.v1` tasks and `magent ask --json --events`, with native-SQLite project/session history, concurrent project tasks, restart recovery cues, changed-file previews, live output, and an optional activity drawer.
- Agent Chat includes a Stage Goal action backed by `magent goal --orchestrated --json`; the chat response includes the saved plan id, cache key, dry-run command, and run command.
- Deep research over `magent research`, including summaries and source tables.
- Config workbench over `magent config schema`, `magent config get`, and `magent config set`, with dynamic guided setup categories.
- Memory workbench over `magent memory graph`, `memory inbox`, `memory node`, `memory update-node --preview`, `memory update-node`, `memory suppress`, `memory unsuppress`, and `memory merge`, with a search/select/edit layout, graph preview, provenance/backlink summary, drawer-based inbox accept/reject, drawer-based merge/suppress actions, and chat handoff for memory improvement.
- SQLite explorer over `magent data sqlite-list`, `sqlite-tables`, and `sqlite-query`, with a database/table/query/results layout, table rendering for row-shaped payloads, table click-to-query, page controls, saved query drawer, and JSON/CSV export drawer.
- Plugin inventory cards, safety/contribution review, install, import, enable, and disable actions over `magent plugin`.
- Session/workbench surface for recipes, patches, command history, checkpoint diff/restore, and policy-governed local session coordination.
- In-app documentation for first-run setup, projects, chat sessions, configuration, memory, SQLite, plugins, and packaging.
- Shared UI primitives now live in `src/components/common.tsx`, with types/constants/utilities in `src/lib/`.
- Feature panels live in `src/components/panels.tsx`; the docs view lives in `src/components/docs.tsx`.
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

Project health uses `inspect_project`, a narrow Tauri command that checks folder existence, local git status, common project files, package manager, languages, frameworks, dirty-file count, likely test commands, and a recommended next action.

## Current Limits

- The desktop bridge streams process output line-by-line. Token-by-token model streaming still depends on MagAgent exposing token events through the CLI.
- Signed updates remain gated on Apple/Windows signing credentials and a stable signed update endpoint.
- Memory inbox review is available for accept/reject flows; richer edit-before-promote flows can build on the current node editor.
- Plugin install/import actions exist, but richer permission/capability review should be added before marketplace-style workflows.
- Feature panels have moved out of `App.tsx`, but `src/components/panels.tsx` should eventually split into per-feature files as the next modularization pass.

## Next UX Targets

- Reuse the streaming bridge for research and recipes.
- Add inline master-plan preview, step-packet preview, and retry controls for saved orchestrated goals.
- Memory inbox edit-before-promote.
- SQLite schema details, export, and richer pagination.
- Plugin permission/capability diffing before install/import.
- Split `src/components/panels.tsx` into per-feature files.
- Add signing/notarization and updater metadata when distribution credentials exist.
- Complete manual keyboard/screen-reader validation on all three operating systems.
