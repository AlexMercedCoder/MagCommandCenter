# Testing

The typed bridge test suite pins Agentic Graph validation, planning, JSON-stdin draft preview, and digest-guarded save arguments. Graph Board model coverage verifies topological stages, parallel cards, cycle detection, card addition, dependency cleanup, and per-card OAP assignment. It also verifies JSON-stdin OAP preview, digest-guarded revision restoration, profile document construction, reference round trips, and pinned session identity. Component coverage verifies that plan results render as a reviewable execution table with gates and resource estimates. The production TypeScript build verifies the task-v2 lifecycle, Profile Center, contract-aware Environment Center, Graph Board, and Workbench integration.

Graph Board coverage now also exercises all six node templates, safe type replacement, duplication, filtering, structured diffs, unreachable/unknown/disconnected diagnostics, inspector authority mismatches, keyboard-operable controls, and a 500-node analysis budget. MagAgent integration tests cover schema, preview, apply, inspect, rename, digest conflicts, per-node durable metadata, immutable graph snapshots, parallel OAP isolation, and pause/resume at safe node boundaries.

Run the frontend contract and component suite:

```bash
npm test
npm run build
```

The complete frontend release gate is:

```bash
npx playwright install chromium
npm run validate
npm audit --audit-level=high
```

`npm run test:coverage` enforces project-wide statement, branch, function, and line thresholds. Playwright starts the Vite shell and verifies browser-preview fallback, navigation, and keyboard command access without a Tauri bridge. ESLint applies TypeScript and React Hooks rules, and Prettier is a required CI check.

`tests/e2e/layout.spec.ts` opens every view at 1280×800, 1440×900, 1024×700, and 375×812
and requires `document.documentElement.scrollHeight` to equal the window height (the
shell never scrolls as a page). It also checks that the Chat composer is inside the
window, its toolbar is one row at 1024px, and the rail spans the full height. It failed
on every size before UI-4.

`npm run test:visual` starts a deterministic Chat fixture without contacting a
model. Playwright renders it at the narrow width produced by the full desktop shell,
asserts explicit select foreground/background colors and horizontal action sizing,
starts a simulated long-running task, verifies heartbeat/timer progress, types into
the composer while the task is active, captures `/tmp/mag-command-center-chat-visual.png`,
and cancels the task. This fast interactive check complements native Tauri screenshot
inspection and catches layout, contrast, and renderer-responsiveness regressions that
data-contract unit tests cannot see.

Run native tests after installing the platform dependencies listed in
`docs/RELEASE_BUILDS.md`:

```bash
cd src-tauri
cargo test --lib
```

Native process-tree tests spawn a shell that starts a grandchild, cancel the tree, and
assert the grandchild is gone: once through `SIGTERM`, once where the tree ignores
`SIGTERM` so the `SIGKILL` escalation must run, and once for a workspace command whose
background child would otherwise hold the output pipe past its timeout. The Windows
variant (a Job Object test using PowerShell and `ping`) compiles everywhere and runs on
the Windows CI runner. Approval-state tests cover the `interrupted` outcome, and state
database tests upgrade an rc.5 schema-2 database and refuse a newer schema.

Managed-install tests run the whole flow offline with a fake `uv` script: the
checksum-verified download branch (from a locally built archive), step output relay,
upgrade switching, failure cleanup, and Cancel of a running step. A real install is
opt-in and makes no paid calls:

```bash
MCC_TEST_MANAGED_INSTALL=1 MCC_UV_BIN=$(command -v uv) \
MCC_MANAGED_PYTHON=/path/to/python3.11+ \
MCC_MANAGED_MAGENT_SPEC="/path/to/agent-approval-interchange /path/to/MagAgent" \
  cargo test --lib installs_a_real_magent_with_uv -- --nocapture
```

Opt-in end-to-end tests also exist for the remote gateway (`MCC_TEST_RPC_URL`,
`MCC_TEST_RPC_TOKEN`) and the Loro harness (`MCC_TEST_LORO_BIN`).

Release tooling has its own Python tests (standard library only):

```bash
python3 scripts/check_release_metadata.py            # advisory unless on a tag
python3 -m unittest discover -s scripts -p "test_*.py"
```

## Packaged upgrade test

CI's `upgrade-test` job installs the previous GitHub release (`.deb` and AppImage on
Linux, `.msi` on Windows), lets it create its state database, seeds projects, a chat
session, and settings with `scripts/upgrade-test/state_db.py`, installs the new build
over it, launches it, and verifies every seeded row survived, the schema is current, a
pre-migration backup exists, and `app_meta.last_opened_version` names the new build. It
skips cleanly when there is no previous release. To reproduce the Linux half without
touching your workstation, run it in a disposable container:

```bash
docker run --rm -v "$PWD:/w" -w /w ubuntu:22.04 bash -c \
  "apt-get update && apt-get install -y xvfb xauth python3 && \
   scripts/upgrade-test/linux.sh --new-version <tauri.conf.json version> \
     --old-deb previous.deb --new-deb new.deb"
```

Never run `linux.sh` or `windows.ps1` directly on a machine you care about; they
install packages and delete the app's data directory.

The frontend suite covers machine-result parsing, durable task controls, event
cursors, memory evidence and reviewed batches, SQLite query drafting/export,
setup guidance, plugin safety summaries, and shared data utilities. Native tests
cover the setup allowlist, project detection, SQLite state round trips and migration version, path-safe artifacts, diagnostics redaction, workspace confinement, safe branch names, worktree parsing, and shell-free command execution. Focused axe-core assertions guard
accessible names, labels, IDs, and ARIA attributes in critical components.
Contract tests also cover JSON checkpoint compare/restore, bounded peer messaging,
restart recovery cues, and passing/failing local performance budgets.
Recovery coverage selects an unfinished durable task on startup and verifies that
event/status polling resumes automatically. Native compilation protects the async
Tauri command boundary used by asks, JSON-stdin operations, and setup commands; live
desktop verification confirms that the elapsed timer, heartbeat, cancellation, and
AAIS modal continue updating while a model call is quiet.
The Projects dashboard also renders ecosystem checks and preserves external gates as
non-passing release evidence rather than hiding them behind the local status.
Environment coverage verifies provider presence, optional capability readiness, cache
status, and stable contract counts without rendering secret values. Task tests include
the v2 `succeeded` terminal state so completed work does not retain a cancel action.

Release CI remains the cross-platform authority for Tauri compilation because GTK,
WebKit, and DBus development packages are operating-system dependencies. Linux local
builds require the full Tauri dependency set, including GLib and DBus headers.
AppImage preflight also verifies that the generated desktop entry uses
`Icon=mag-command-center`, matching Tauri's packaged hicolor icon identifier. This lets
`linuxdeploy` create the root icon link consumed by `appimagetool`.

Before a release, also verify a live MagAgent checkout:

1. Start an ask and confirm its task appears before the first model response.
2. Switch tasks and confirm event cursors do not duplicate activity.
3. Cancel a running ask that has started a tool (for example a test run) and verify MagAgent and the tool process both exit.
4. Restart Command Center and confirm projects, sessions, and chat history recover.
5. Preview and apply a reviewed memory batch against a disposable graph.
6. Inspect and restore a disposable file checkpoint, then verify the diff clears.
7. Start four tasks in separate projects and confirm navigation stays responsive.
8. Restart with an unfinished task and verify it is labeled as recovered.
9. Refresh Environment Center and confirm provider names, tool packs, cache guidance, and task-v2 contract status render without any key values.
10. Validate and review a disposable Agentic Graph, cancel the final confirmation once, then approve and run it.
11. Create a project profile, review effective authority, save it, edit it, and restore the prior revision.
12. Pin that profile to a chat, change the profile elsewhere, and confirm the drift warning appears before adopting the new digest.
13. Select a project crew coordinator and confirm new chats, research, recipe plans, and graph runs carry that profile.
14. Select files and an upload as chat context; verify context chips, budgets, and prompt attribution.
15. Exercise Git stage/unstage/diff and cancel a discard; create and remove a disposable worktree.
16. Run a quoted command and verify shell operators are inert rather than interpreted.
17. Create gate-free and gated schedules; verify only the gate-free schedule auto-runs.
18. Run sequential, parallel, and coordinator group sessions (experimental) with two disposable profiles.
19. Fork, compact, and export a session; restart and confirm schedules, shortcuts, appearance, and transcripts recover.
20. Confirm a clean profile shows no remote runtime form. Enable Settings > Experimental features > Remote runtime, connect a disposable authenticated loopback runtime, and confirm its token is requested again after restart unless Remember was ticked.
21. Start a long chat, confirm elapsed time advances before the first model token, navigate elsewhere and back, and stop the run without an OS "not responding" warning.
22. During a quiet provider wait, confirm the lifecycle heartbeat updates at least every two seconds without exposing private model reasoning.
