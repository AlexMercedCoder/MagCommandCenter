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

- `core/magent`: CLI detection, command execution, JSON parsing, version checks.
- `core/projects`: recent projects, active project state, folder permissions.
- `features/chat`: project chat, session history, response/audit rendering.
- `features/config`: provider/model/permission/memory configuration.
- `features/memory`: MagGraph browser and memory improvement workflows.
- `features/sqlite`: database/table/schema/query browser.
- `features/plugins`: skills and plugin management.
- `features/readiness`: first-run and per-project checks.

## Safety

- Never display API keys by default.
- Prefer read-only database browsing.
- Route memory writes through MagAgent/MagGraph APIs rather than raw file mutation.
- Show command previews for actions that modify files/config/memory.
- Respect MagAgent permission modes.

## Packaging

Set up CI once the scaffold exists:

- macOS universal or arm64/x64 builds
- Windows x64 installer
- Linux AppImage/deb/rpm as practical

## Early Risks

- Missing JSON APIs in MagAgent.
- Streaming chat ergonomics.
- Cross-platform Python/MagAgent discovery.
- Handling long-running agent commands without freezing the UI.
- Safe visualization and editing of graph memory.
