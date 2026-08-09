# Mag Command Center 0.2.0 Release Notes

Mag Command Center `0.2.0` turns the initial desktop shell into a durable, event-native workspace for MagAgent projects.

## Added

- Added concurrent project chats backed by MagAgent's versioned task and event protocol.
- Added cancellation, task recovery, checkpoint/session workbench views, and artifact previews.
- Added a WAL-backed native application state store instead of relying only on browser storage.
- Added ecosystem readiness reporting that separates deterministic local checks from external release gates.
- Added diagnostics bundles, project health details, richer memory inspection, and improved SQLite workflows.

## Changed

- Extracted execution and workbench runtime controllers from the main application component.
- Improved long-running task feedback, chat activity, responsive layout, accessibility, and bounded rendering of large results.
- Updated repository and in-app documentation for the durable desktop runtime.

## Compatibility

- MagAgent `0.34.0+` is required.
- MagAgent `0.34.0` requires MagGraph `0.4.0+`.

## Distribution

- GitHub Actions builds Linux, macOS Apple Silicon, macOS Intel, and Windows installers.
- Artifacts remain unsigned, so macOS Gatekeeper and Windows SmartScreen warnings are expected.
