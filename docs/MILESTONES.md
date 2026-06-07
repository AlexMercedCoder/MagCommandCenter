# Milestones

## M0: Repository And Planning

- Create repository.
- Add README and planning docs.
- Push initial commit.

## M1: Desktop Scaffold

- Add Tauri + React + TypeScript.
- Add app shell, navigation, and project picker.
- Detect `magent --version`.
- Run `magent system info --json` and `magent readiness`.

## M2: Project Chat

- Project-scoped prompt box.
- Run `magent ask --json`.
- Render final response, audit, files touched, tool summary, and errors.
- Store local session history.

## M3: Configuration Workbench

- Provider/model setup UI.
- Model role editor.
- Permission mode editor.
- Memory/subagent settings.
- Use MagAgent config APIs rather than hand-editing TOML where possible.

## M4: Memory And SQLite Workbench

- Browse MagGraph memory nodes and backlinks.
- Browse MagAgent SQLite databases and workbench stores.
- Select memory nodes and launch improvement prompts.
- Apply safe memory edits through MagAgent commands.

## M5: Skills And Plugins

- List skills/plugins.
- Inspect plugin-contributed agents, recipes, hooks, and MCP configs.
- Enable/disable/import plugins.

## M6: Packaging

- macOS, Windows, and Linux builds.
- First-run MagAgent install/upgrade guidance.
- Release docs and screenshots.
