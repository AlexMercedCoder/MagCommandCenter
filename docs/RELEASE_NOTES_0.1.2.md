# Mag Command Center 0.1.2 Release Notes

Mag Command Center `0.1.2` expands desktop release coverage with a dedicated Intel macOS build.

## Highlights

- Added a separate macOS Intel build job using the `macos-13` GitHub Actions runner.
- Kept the existing macOS Apple Silicon build on `macos-14`.
- Updated release documentation to explain which macOS installer to use:
  - Apple Silicon Macs should use the `aarch64` DMG.
  - Intel Macs should use the `x64` or `x86_64` DMG.
- Updated README, release build docs, distribution docs, release checklist, and in-app Docs packaging notes.

## Requirements

- MagAgent `0.30.0+` is recommended.
- The desktop app shells out to `magent`; custom MagAgent installs can be selected by launching with `MAGENT_BIN=/path/to/magent`.

## Distribution Notes

- 0.1.2 artifacts are still unsigned.
- macOS may show Gatekeeper warnings until Developer ID signing and notarization are configured.
- Windows may show SmartScreen warnings until code signing is configured and reputation develops.
- In-app updates are not enabled yet; updater support should wait for signed updater artifacts and a stable update endpoint.

## Verification

The release workflow runs frontend tests, frontend build, Rust tests, Rust check, platform-native desktop packaging, artifact upload, and draft release asset publication for `v*` tags.
