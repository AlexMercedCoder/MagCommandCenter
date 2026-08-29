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

- `npm run format:check`
- `npm run lint`
- `npm run test:coverage`
- `npm test`
- `npm run build`
- `npm run test:e2e`
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
- Select bounded workspace context, upload an attachment, preview text/image/binary files, and verify the context reaches an ask.
- Review working/staged diffs; stage, unstage, and cancel a discard; create/remove a disposable worktree.
- Confirm command-console shell syntax is inert, timeout works, and oversized output is truncated.
- Run sequential, parallel, and coordinator group sessions and verify attributed messages and pinned profile digests.
- Fork, compact, and export a session; confirm the source session remains unchanged.
- Schedule a gate-free graph and a gated graph; confirm the gated graph waits for explicit approval.
- Search projects, sessions, profiles, and runs from the command palette; edit a shortcut and verify conflict detection.
- Review Tools & Extensions readiness and verify untrusted user/project extension registration is rejected.
- Test light, dark, system, all accents, and reduced-motion mode.
- Force a renderer test error and verify the recovery boundary offers reload without data mutation.

## Security And Packaging

- Keep Tauri CSP enabled in `src-tauri/tauri.conf.json`; do not ship with `csp: null`.
- Keep setup installation allowlisted to the bootstrap commands documented in the README.
- Confirm GitHub Actions desktop artifact workflow passes for Linux, macOS Apple Silicon, macOS Intel, and Windows.
- Confirm tag builds publish a GitHub release with Linux, macOS, and Windows installers attached.
- Download and validate the CycloneDX SBOM artifact and GitHub build-provenance attestations.
- Document that artifacts are unsigned until Apple notarization and Windows code-signing credentials are configured.
- Keep [DISTRIBUTION.md](DISTRIBUTION.md) current with signing, notarization, updater, and first-run warning status.

## Release Notes

- Mention MagAgent `1.0.0` as the minimum supported version and list negotiated contracts.
- For `1.0.0-rc.1`, negotiate the stable desktop/task/event/memory/OAP/AGS contracts and smoke-test profile lifecycle, workspace context/Git, group sessions, governed schedules, and graph execution.
- Mention which desktop platforms have verified build artifacts.
- Call out unsigned artifact status and any first-run OS warnings users may see.
