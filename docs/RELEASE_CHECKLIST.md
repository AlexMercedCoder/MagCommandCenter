# Release Checklist

Use this checklist before cutting a public Mag Command Center release.

## Local Gates

- `npm test`
- `npm run build`
- `npm audit`
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo fmt --check --manifest-path src-tauri/Cargo.toml`
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo test --manifest-path src-tauri/Cargo.toml`
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo check --manifest-path src-tauri/Cargo.toml`
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig npm run tauri -- build --bundles deb,rpm`

## Functional Smoke

- Launch the app and confirm the Setup tab detects the installed `magent`.
- Open a real project folder and confirm project health detection returns package manager, languages, test commands, and git dirty-file count.
- Run readiness from the Dashboard.
- Create or select a chat session and verify streamed output reaches the transcript.
- Open Config, Memory, SQLite, Plugins, Workbench, and Docs tabs without render errors.
- Confirm Memory node inspection shows body/provenance/backlink fields when present.
- Confirm SQLite table browsing and saved query selection still render bounded tables.
- Capture or inspect desktop and narrow viewport screenshots for overlapping controls, horizontal page overflow, and out-of-bounds long paths.

## Security And Packaging

- Keep Tauri CSP enabled in `src-tauri/tauri.conf.json`; do not ship with `csp: null`.
- Keep setup installation allowlisted to the bootstrap commands documented in the README.
- Confirm GitHub Actions desktop artifact workflow passes for Linux, macOS Apple Silicon, macOS Intel, and Windows.
- Confirm tag builds draft a GitHub release with Linux, macOS, and Windows installers attached.
- Document that 0.1.0 artifacts are unsigned until Apple notarization and Windows code-signing credentials are configured.
- Keep [DISTRIBUTION.md](DISTRIBUTION.md) current with signing, notarization, updater, and first-run warning status.

## Release Notes

- Mention the minimum recommended MagAgent version.
- Mention which desktop platforms have verified build artifacts.
- Call out unsigned artifact status and any first-run OS warnings users may see.
