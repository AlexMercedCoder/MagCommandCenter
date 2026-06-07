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
