# Mag Command Center 0.1.4 Release Notes

Mag Command Center `0.1.4` makes Agent Chat feel more like an operational cockpit over MagAgent `0.32.11`.

## Added

- Added a Run Cockpit to Agent Chat with model round counts, tool counts, total observed duration, slowest tool, generated artifacts, and permission friction.
- Added in-panel project switching so users can bounce between project-scoped chats without leaving Agent Chat.
- Added resilient cockpit parsing for both structured MagAgent events and streamed terminal lines.

## Changed

- Raised the recommended MagAgent version to `0.32.11+` for the best timing, artifact verification, and file-write recovery behavior.
- Updated README, release checklist, workspace docs, distribution notes, and in-app documentation for the new cockpit flow.

## Compatibility

- MagAgent `0.32.11+` is recommended.
- The desktop app still shells out to `magent`; custom MagAgent installs can be selected by launching with `MAGENT_BIN=/path/to/magent`.
- Linux, macOS Apple Silicon, macOS Intel, and Windows artifacts are built by GitHub Actions.

## Known Distribution Notes

- 0.1.4 artifacts are still unsigned.
- macOS may show Gatekeeper warnings until Developer ID signing and notarization are configured.
- Windows may show SmartScreen warnings until code signing is configured and reputation develops.
