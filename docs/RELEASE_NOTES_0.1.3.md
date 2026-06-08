# Mag Command Center 0.1.3 Release Notes

Mag Command Center `0.1.3` aligns the desktop first-run experience with MagAgent `0.30.1`.

## Changed

- Raised the recommended MagAgent version to `0.30.1+`.
- Corrected first-run install and upgrade commands to use the published `mag-agent` PyPI package name.
- Updated setup diagnostics, in-app documentation, README guidance, and distribution notes for the MagAgent provider credential wizard.
- Clarified that MagAgent `0.30.1` includes the Python 3.14-safe MagGraph dependency path.

## Compatibility

- MagAgent `0.30.1+` is recommended.
- The desktop app shells out to `magent`; custom MagAgent installs can be selected by launching with `MAGENT_BIN=/path/to/magent`.
- Linux, macOS Apple Silicon, macOS Intel, and Windows artifacts are built by GitHub Actions.

## Known Distribution Notes

- 0.1.3 artifacts are still unsigned.
- macOS may show Gatekeeper warnings until Developer ID signing and notarization are configured.
- Windows may show SmartScreen warnings until code signing is configured and reputation develops.
