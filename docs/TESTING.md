# Testing

The typed bridge test suite pins Agentic Graph validation, planning, JSON-stdin draft preview, and digest-guarded save arguments. Graph Board model coverage verifies topological stages, parallel cards, cycle detection, card addition, dependency cleanup, and per-card OAP assignment. It also verifies JSON-stdin OAP preview, digest-guarded revision restoration, profile document construction, reference round trips, and pinned session identity. Component coverage verifies that plan results render as a reviewable execution table with gates and resource estimates. The production TypeScript build verifies the task-v2 lifecycle, Profile Center, contract-aware Environment Center, Graph Board, and Workbench integration.

Graph Board coverage now also exercises all six node templates, safe type replacement, duplication, filtering, structured diffs, unreachable/unknown/disconnected diagnostics, inspector authority mismatches, keyboard-operable controls, and a 500-node analysis budget. MagAgent integration tests cover schema, preview, apply, inspect, rename, digest conflicts, per-node durable metadata, immutable graph snapshots, parallel OAP isolation, and pause/resume at safe node boundaries.

Run the frontend contract and component suite:

```bash
npm test
npm run build
```

Run native tests after installing the platform dependencies listed in
`docs/RELEASE_BUILDS.md`:

```bash
cd src-tauri
cargo test --lib
```

The frontend suite covers machine-result parsing, durable task controls, event
cursors, memory evidence and reviewed batches, SQLite query drafting/export,
setup guidance, plugin safety summaries, and shared data utilities. Native tests
cover the setup allowlist, project detection, SQLite state round trips, path-safe
artifact formats, and diagnostics redaction. Focused axe-core assertions guard
accessible names, labels, IDs, and ARIA attributes in critical components.
Contract tests also cover JSON checkpoint compare/restore, bounded peer messaging,
restart recovery cues, and passing/failing local performance budgets.
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
3. Cancel a running ask and verify the child process exits.
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
