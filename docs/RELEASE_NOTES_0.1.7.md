# Mag Command Center 0.1.7 Release Notes

Mag Command Center `0.1.7` supersedes the `0.1.6` desktop build with Linux packaging that targets older glibc environments.

## Changed

- Built Linux release artifacts on `ubuntu-22.04` so the `.deb` and `.rpm` work on glibc `2.35` era systems instead of requiring glibc `2.39`.
- Published tagged GitHub releases directly instead of leaving release assets in draft state.

## Compatibility

- MagAgent `0.32.14+` is still recommended for provider credential aliases, current Anthropic/Gemini defaults, request-parameter compatibility, timing diagnostics, and artifact verification.

## Notes

- Artifacts are still unsigned.
