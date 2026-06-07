# Product Plan

## Product Thesis

Mag Command Center makes MagAgent approachable as a daily desktop workbench. The CLI remains the source of truth, while the desktop app provides a visual project, chat, configuration, memory, and plugin cockpit.

## Primary Personas

- Developers who want a local coding agent with project memory and visible control.
- Power users who prefer CLI tools but want a faster way to inspect state, memory, and configuration.
- Agent builders who manage skills, plugins, recipes, hooks, and subagents across projects.

## Core Experiences

### Project Workspace

- Open a folder.
- See project readiness, MagAgent version, provider readiness, model health, memory status, command history, recipes, and recent sessions.
- Switch between pinned and recent projects.
- Guide first-time users through MagAgent detection, install, upgrade, and readiness checks.

### Agent Chat

- Project-scoped chat using MagAgent.
- Select provider, model, agent definition, permission mode, and repair/audit behavior.
- Show responses, tool calls, files touched, task audit, blocked permission actions, and session history.
- Show immediate running state and structured command/event timelines, with true streaming planned as the next backend bridge.

### Configuration

- Configure the same MagAgent config files used by the CLI.
- Provider wizard, model role editor, permission mode editor, memory settings, subagent caps, MCP, gateways, and plugin settings.
- Use MagAgent machine-readable config APIs where available.

### Memory Workbench

- Browse MagGraph memory nodes and edges for the active project/user.
- Inspect node body, metadata, tags, backlinks, provenance, stale/suppressed state, and related nodes.
- Search/filter by text, type, tag, project, recency, and relationship.
- Select memories and ask MagAgent to improve, merge, suppress, unsuppress, rewrite, summarize, or promote them.
- Visually preview graph nodes and use chat as the review surface before applying memory edits.

### SQLite Explorer

- Browse MagAgent workbench and local SQLite databases safely.
- List databases, tables, schemas, sample rows, and read-only queries.
- Use write actions only through explicit MagAgent workflows.

### Skills And Plugins

- List installed skills and plugins.
- Inspect contributed agents, recipes, hooks, tools, MCP configs, and permissions.
- Import, install, enable, and disable plugin packs.
- Add permission and capability review before marketplace-style plugin installation.

### Workbench

- Run reusable recipes against the active project.
- Inspect patches and command history.
- Grow into a resumable jobs, checkpoints, and plans cockpit as MagAgent exposes richer desktop APIs.

## Platform Target

- macOS
- Windows
- Linux

Tauri is preferred for smaller native packaging and local filesystem/process integration.
