# Release Checklist

## Graph Board

- [ ] All MagAgent graph authoring and runtime tests pass against the packaged version.
- [ ] Frontend tests, production build, axe checks, and 500-node performance test pass.
- [ ] YAML and JSON fixtures round-trip through open, structured edit, source edit, validate, and save.
- [ ] Draft recovery and external-file reload/compare/save-as work in a packaged app.
- [ ] Selective gates, live card states, pause/resume boundaries, cancellation, and safe resume are exercised.
- [ ] Light and dark screenshots are reviewed at wide, laptop, and minimum supported sizes.
- [ ] Linux, Windows, macOS Intel, and macOS Apple Silicon workflow jobs pass.

Use this checklist before cutting a public Mag Command Center release.

## Local Gates

- `npm test`
- `npm run build`
- `npm audit`
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo fmt --check --manifest-path src-tauri/Cargo.toml`
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo test --manifest-path src-tauri/Cargo.toml`
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo check --manifest-path src-tauri/Cargo.toml`
- `PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig npm run tauri -- build --bundles deb,rpm,appimage`

## Functional Smoke

- Launch the app and confirm the Setup tab detects the installed `magent`.
- Open a real project folder and confirm project health detection returns package manager, languages, test commands, and git dirty-file count.
- Run readiness from the Dashboard.
- Refresh Environment Center and verify task-v2, provider presence, capability packs, and cache guidance without secret values.
- Create or select a chat session and verify streamed output reaches the transcript.
- Confirm the Agent Chat Run Cockpit separates tool timings, permission requests, and generated artifacts from raw logs.
- Open Config, Memory, SQLite, Plugins, Workbench, and Docs tabs without render errors.
- Confirm Memory node inspection shows body/provenance/backlink fields when present.
- Confirm SQLite table browsing and saved query selection still render bounded tables.
- Capture or inspect desktop and narrow viewport screenshots for overlapping controls, horizontal page overflow, and out-of-bounds long paths.

## Security And Packaging

- Keep Tauri CSP enabled in `src-tauri/tauri.conf.json`; do not ship with `csp: null`.
- Keep setup installation allowlisted to the bootstrap commands documented in the README.
- Confirm GitHub Actions desktop artifact workflow passes for Linux, macOS Apple Silicon, macOS Intel, and Windows.
- Confirm tag builds publish a GitHub release with Linux, macOS, and Windows installers attached.
- Document that artifacts are unsigned until Apple notarization and Windows code-signing credentials are configured.
- Keep [DISTRIBUTION.md](DISTRIBUTION.md) current with signing, notarization, updater, and first-run warning status.

## Release Notes

- Mention the minimum recommended MagAgent version.
- For `0.4.0`, require published MagAgent `0.95.0+`, negotiate the stable desktop/task/event/memory/OAP contracts, and smoke-test profile create/edit/rollback, profile-pinned chat, graph validation, and plan review.
- Mention which desktop platforms have verified build artifacts.
- Call out unsigned artifact status and any first-run OS warnings users may see.
