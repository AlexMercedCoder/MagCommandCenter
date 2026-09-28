# Release Checklist

## Graph Board

- [ ] All MagAgent graph authoring and runtime tests pass against the packaged version.
- [ ] Frontend tests, production build, axe checks, and 500-node performance test pass.
- [ ] YAML and JSON fixtures round-trip through open, structured edit, source edit, validate, and save.
- [ ] Draft recovery and external-file reload/compare/save-as work in a packaged app.
- [ ] Selective gates, live card states, pause/resume boundaries, cancellation, and safe resume are exercised.
- [ ] Light and dark screenshots are reviewed at wide, laptop, and minimum supported sizes.
- [ ] Linux, Windows, macOS Intel, and macOS Apple Silicon workflow jobs pass.
- [ ] Generated OAP profiles preview before persistence and each scope writes only to its documented root.

Use this checklist before cutting a public Mag Command Center release.

## Local Gates

- `python3 scripts/check_release_metadata.py --strict --tag v<version>`
- `python3 -m unittest discover -s scripts -p "test_*.py"`
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
- Run sequential, parallel, and coordinator group sessions (experimental) and verify attributed messages and pinned profile digests.
- Stop a run that started a tool process and confirm no MagAgent or tool process remains (`ps`/Task Manager).
- Trigger an approval, press Esc, confirm the request stays pending behind the "waiting" button, reopen it, and Deny it with the keyboard.
- Stop a run while an approval is pending and confirm the "Approval interrupted" notice.
- On a clean profile confirm Settings shows no remote runtime form until Experimental features > Remote runtime is turned on.
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
- Confirm the `upgrade-test` job passed on Linux and Windows (or skipped only because no previous release exists), and upgrade macOS manually once.
- Confirm tag builds publish a GitHub release with Linux, macOS, and Windows installers, `SHA256SUMS`, and both CycloneDX SBOMs attached.
- Run `sha256sum -c SHA256SUMS --ignore-missing` and `gh attestation verify` on one downloaded installer per platform.
- Check the release body's signing status lines; unsigned platforms must be stated as unsigned.
- Keep [DISTRIBUTION.md](DISTRIBUTION.md) current with signing, notarization, updater, and first-run warning status.

## Release Notes

- Mention MagAgent `1.4.0` as the minimum supported version and list negotiated contracts. MagAgent 1.4.0 must be published before this release.
- On a clean profile with no terminal: create a profile, start the offline demo and chat with the mock provider, then save a provider key, click Test connection, and confirm the key is absent from `ps`, logs, diagnostics bundles, and `command-center.sqlite3`.
- For `1.0.0-rc.5`, negotiate the stable desktop/task/event/memory/OAP/AGS/AAIS contracts and smoke-test profile lifecycle, workspace context/Git, group sessions, governed schedules, graph execution, exact-action approval presentation, and WebMCP registry calls.
- Mention which desktop platforms have verified build artifacts.
- Call out unsigned artifact status and any first-run OS warnings users may see.
- Label extensions, remote runtime, and group sessions as experimental.
- Note that `apt install` sees an rc-to-1.0.0 `.deb` upgrade as a downgrade; recommend `sudo apt install ./<file>.deb --allow-downgrades` or `sudo dpkg -i`.
