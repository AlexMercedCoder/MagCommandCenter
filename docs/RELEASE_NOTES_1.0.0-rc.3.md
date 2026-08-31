# Mag Command Center 1.0.0-rc.3

Released on 2026-08-31.

This candidate adds complete local-desktop AAIS 1.0 presentation for streamed MagAgent chats,
group participants, graph runs, and graph resumes. Exact requests appear in one global modal, and
the Rust host validates each decision before writing it only to the originating process.

## Validation

- TypeScript production build and 74-test frontend suite.
- AAIS decision serialization and origin-stream regression coverage.
- Rust AAIS dependency resolution, lockfile validation, native Linux compilation, and all 9 Rust
  tests against GTK 3 and WebKitGTK 4.1.
- Optimized Tauri production bundle validation for Debian, RPM, and AppImage artifacts.
