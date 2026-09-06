# Mag Command Center 1.0.0-rc.4

Release candidate prepared on 2026-09-06.

This candidate keeps long-running MagAgent work off the desktop UI thread and gives chat the same
durable, observable interaction model as the MagAgent Web UI. Conversation and activity are
separated, timers and heartbeats remain live during quiet model calls, active tasks recover after
restart, permission requests stay presentable, and users can continue typing or cancel work.

Graph authoring now keeps AI generation prominent alongside blank/open workflows while retaining
strict validation, editing, recovery, approval, execution, retry, and audit behavior. Native form
controls receive explicit light/dark colors and responsive sizing to prevent the low-contrast and
collapsed-control failures reported on Linux.

The Tools page adds a governed WebMCP console for exact-origin configuration, live schema
discovery, revision-bound invocation, mutating-call confirmation, and structured results. Calls
are delegated to MagAgent, so profile, AAIS, audit, and browser-origin boundaries remain intact.

## Validation

- Prettier, ESLint, TypeScript, production Vite build, and 82-test coverage suite.
- Playwright interaction and deterministic visual fixtures covering responsiveness and contrast.
- Rust formatting, native compilation, and native unit tests against GTK 3 and WebKitGTK 4.1.
- Release bundle preflight for supported local Linux package formats.

See [WebMCP](WEBMCP.md), [testing](TESTING.md), and the [next-release engineering record](RELEASE_NOTES_NEXT.md).
