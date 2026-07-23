# Mag Command Center 0.1.5 Release Notes

Mag Command Center `0.1.5` adds a desktop entry point for MagAgent's staged orchestrated goal workflow.

## Added

- Added Stage Goal in Agent Chat.
- Stage Goal calls `magent goal --orchestrated --json` for the active project.
- Chat now returns the saved staged plan id, cache key, dry-run command, and run command.

## Changed

- Raised the recommended MagAgent version to `0.32.13+`.
- Updated README, workspace docs, product plan, distribution notes, and in-app docs for the staged-goal workflow.

## Compatibility

- MagAgent `0.32.13+` is recommended for `magent goal-run`, staged-plan dry runs, failed-step retry, and background `orchestrated_goal` daemon tasks.
- The desktop app still shells out to `magent`; custom MagAgent installs can be selected by launching with `MAGENT_BIN=/path/to/magent`.
- Linux, macOS Apple Silicon, macOS Intel, and Windows artifacts are built by GitHub Actions.

## Known Distribution Notes

- 0.1.5 artifacts are still unsigned.
- macOS may show Gatekeeper warnings until Developer ID signing and notarization are configured.
- Windows may show SmartScreen warnings until code signing is configured and reputation develops.
