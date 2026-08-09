# Testing

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

Release CI remains the cross-platform authority for Tauri compilation because GTK,
WebKit, and DBus development packages are operating-system dependencies. Linux local
builds require the full Tauri dependency set, including GLib and DBus headers.

Before a release, also verify a live MagAgent checkout:

1. Start an ask and confirm its task appears before the first model response.
2. Switch tasks and confirm event cursors do not duplicate activity.
3. Cancel a running ask and verify the child process exits.
4. Restart Command Center and confirm projects, sessions, and chat history recover.
5. Preview and apply a reviewed memory batch against a disposable graph.
6. Inspect and restore a disposable file checkpoint, then verify the diff clears.
7. Start four tasks in separate projects and confirm navigation stays responsive.
8. Restart with an unfinished task and verify it is labeled as recovered.
