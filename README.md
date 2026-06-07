# Mag Command Center

Mag Command Center is a cross-platform desktop app for managing MagAgent projects, agents, memory, plugins, and local productivity workflows.

The app is intended to be a polished UI over the installed `magent` CLI and the same MagAgent configuration, MagGraph memory, SQLite stores, skills, and plugins used from the terminal.

## Goals

- Open local project folders and run project-scoped MagAgent chat sessions.
- Manage multiple projects and agent profiles from one desktop workspace.
- Configure MagAgent providers, model roles, permissions, memory, subagents, gateways, MCP, skills, and plugins without hand-editing config files.
- Browse and improve MagGraph memory nodes, backlinks, provenance, pending memory candidates, and project context.
- Explore MagAgent SQLite/workbench databases with safe read/query workflows.
- Package native desktop builds for macOS, Windows, and Linux.

## Architecture Direction

Mag Command Center should treat the MagAgent CLI as the backend contract wherever possible:

- Shell out to `magent` commands for readiness, provider setup, model health, asks, memory, plugins, and project operations.
- Prefer JSON/machine-readable command output over importing MagAgent internals.
- Keep MagAgent config and storage as the source of truth.
- Add missing MagAgent CLI integration APIs upstream as part of MagAgent releases.

The recommended desktop stack is Tauri + React + TypeScript.

## Current Scaffold

The initial app shell is now a Tauri + React + TypeScript workspace with:

- First-time setup wizard that detects MagAgent, checks the required desktop API version, and can install or upgrade MagAgent with `pipx` or user-scoped `pip`.
- Persistent project selection, pinned projects, and recent projects.
- Native folder picking through the Tauri dialog plugin.
- Project launcher with MagAgent readiness, richer project health inspection, git dirty-file counts, detected languages/frameworks/package manager, suggested test commands, and command history.
- Project-scoped agent chat with per-project/per-session local chat history, session create/rename/delete, session summaries, quick prompts, running status, live stdout/stderr streaming, and structured event timelines.
- Direct deep research view through `magent research`.
- MagAgent readiness checks through the installed `magent` CLI.
- JSON chat integration through `magent ask --json --events`.
- Dynamic guided config wizard controls through `magent config schema`, plus targeted config updates through `magent config get/set`.
- Memory graph browsing, memory inbox review, visual graph preview, provenance/backlink summary, node inspection, safe edit preview/apply, suppress/unsuppress, merge actions, and handoff to chat for memory improvement.
- SQLite database/table/query inspection with tabular result rendering, table click-to-query, saved queries, page controls, and JSON/CSV export text through `magent data sqlite-*`.
- Installed plugin inspection plus safety/contribution review, install/import/enable/disable actions through `magent plugin`.
- Session/workbench view for recipes, patch inspection, and command history.
- Light and dark themes inspired by neubrutalist interface patterns.

Design notes live in [design.md](design.md), and the current product surface is summarized in [docs/WORKSPACE_MVP.md](docs/WORKSPACE_MVP.md). The app intentionally uses high-contrast colors, thick borders, hard offset shadows, bold typography, and accessible focus states in both themes.

## Development

Install JavaScript dependencies:

```bash
npm install
```

Run the web shell:

```bash
npm run dev
```

Run the desktop app during development:

```bash
npm run tauri dev
```

Build the frontend:

```bash
npm run build
```

Build the native desktop app:

```bash
npm run tauri build
```

On Linux, Tauri requires the local WebKit/GTK development stack. For Debian/Ubuntu-style systems, install the native prerequisites before running the Tauri commands:

```bash
sudo apt install build-essential curl wget file pkg-config libssl-dev libdbus-1-dev libglib2.0-dev libwebkit2gtk-4.1-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
```

If Linuxbrew's `pkg-config` is ahead of the system one, point Cargo at the apt pkgconfig directories:

```bash
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig npm run tauri build
```

The desktop bridge honors `MAGENT_BIN`, then checks common pyenv and local install paths, then falls back to `magent` on `PATH`. MagAgent `0.30.0` or newer is recommended because Command Center uses the desktop integration APIs introduced in that release.

Long-running MagAgent commands can use the streaming bridge. The bridge emits stdout/stderr lines to the React app while the process runs, then returns the final command result for history and JSON parsing.

The desktop app also exposes a narrow project inspection command. It checks the selected folder, runs `git -C <project> status --short`, and detects common project files to infer languages, frameworks, package manager, and likely test commands.

First-time users can start in the Setup tab. The setup bridge intentionally allows only a narrow bootstrap command set:

- `magent --version`
- `pipx install magagent`
- `pipx upgrade magagent`
- `pipx ensurepath`
- `python3 -m pip install --user -U magagent`

This keeps the onboarding flow useful without turning the desktop app into an arbitrary shell runner.

## Initial Milestones

1. Scaffold Tauri + React + TypeScript.
2. Detect installed MagAgent and run `magent readiness`.
3. Add project picker and recent projects.
4. Add project-scoped chat shell.
5. Add provider/model/permission configuration UI.
6. Add memory and SQLite explorers.
7. Add skills/plugins management.
8. Add release packaging for macOS, Windows, and Linux.

## Related Projects

- MagAgent: <https://github.com/AlexMercedCoder/MagAgent>
- MagGraph: <https://github.com/AlexMercedCoder/MagGraph>
