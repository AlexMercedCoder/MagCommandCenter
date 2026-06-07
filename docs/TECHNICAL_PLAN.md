# Technical Plan

## Recommended Stack

- Tauri
- React
- TypeScript
- Vite
- CSS modules or a small component system
- Rust sidecar commands for process/file integration

## Integration Model

The desktop app should shell out to `magent` and parse JSON output. This keeps the desktop app loosely coupled to MagAgent internals.

Initial command contracts needed from MagAgent:

- `magent system info --json`
- `magent readiness --json --project <path>`
- `magent ask --json --project <path> --repair-attempts 1 <task>`
- `magent provider models <provider> --refresh`
- `magent provider tool-smoke <provider> --model <model> --timeout <seconds>`
- `magent model health`
- `magent config get --json`
- `magent config set --json <path> <value>`
- `magent memory graph --json`
- `magent memory node show/edit --json`
- `magent data sqlite list/query --json`
- `magent plugin list`
- `magent agent list`
- `magent recipe list`

## Desktop App Modules

- `src/magent.ts`: CLI detection helpers, command execution, streaming events, setup commands, project inspection, JSON parsing.
- `src/App.tsx`: top-level state, action orchestration, routing between panels.
- `src/components/common.tsx`: shared display primitives such as JSON, table, command, status, and toast panels.
- `src/components/panels.tsx`: feature panels for setup, dashboard, chat, research, config, memory, SQLite, plugins, and workbench.
- `src/components/docs.tsx`: in-app documentation synchronized with the repo docs.
- `src/lib/types.ts`: shared TypeScript types.
- `src/lib/constants.ts`: navigation, storage keys, prompts, and version constants.
- `src/lib/utils.ts`: storage, parsing, table extraction, memory helpers, and formatting utilities.

## Safety

- Never display API keys by default.
- Prefer read-only database browsing.
- Route memory writes through MagAgent/MagGraph APIs rather than raw file mutation.
- Show command previews for actions that modify files/config/memory.
- Respect MagAgent permission modes.

## Packaging

CI now builds platform-native artifacts through `.github/workflows/desktop-build.yml`:

- Linux `deb` and `rpm` on Ubuntu.
- macOS `dmg` and `.app` on macOS.
- Windows `nsis` and `msi` on Windows.

The Tauri icon set includes PNG, ICNS, and ICO assets. Unsigned macOS/Windows artifacts are expected until signing and notarization credentials are added.

## Early Risks

- Missing JSON APIs in MagAgent.
- Streaming chat ergonomics.
- Cross-platform Python/MagAgent discovery.
- Handling long-running agent commands without freezing the UI.
- Safe visualization and editing of graph memory.
