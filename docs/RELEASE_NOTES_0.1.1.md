# Mag Command Center 0.1.1 Release Notes

Mag Command Center `0.1.1` is a focused UI hardening and documentation release.

## Highlights

- Fixed layout overflow in the Agent Chat panel where session controls and quick prompts could overlap the right-side event and stream panels.
- Removed horizontal page overflow at desktop widths.
- Improved wrapping for long project paths, button labels, status text, nav labels, and compact cards.
- Added repository screenshots for Projects, Agent Chat, Memory, SQLite, Docs, and dark mode.
- Added a screenshot gallery to the in-app Docs tab.
- Refreshed docs so GitHub readers and in-app users can see the current UI.

## Requirements

- MagAgent `0.30.0+` is recommended.
- The desktop app shells out to `magent`; custom MagAgent installs can be selected by launching with `MAGENT_BIN=/path/to/magent`.

## Distribution Notes

- 0.1.1 artifacts are still unsigned.
- macOS may show Gatekeeper warnings until Developer ID signing and notarization are configured.
- Windows may show SmartScreen warnings until code signing is configured and reputation develops.
- In-app updates are not enabled yet; updater support should wait for signed updater artifacts and a stable update endpoint.

## Verification

The release workflow runs frontend tests, frontend build, Rust tests, Rust check, platform-native desktop packaging, artifact upload, and draft release asset publication for `v*` tags.
