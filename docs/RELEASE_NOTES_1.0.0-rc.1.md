# Mag Command Center 1.0.0-rc.1

This release candidate turns Mag Command Center into a complete local-first desktop harness for MagAgent 1.0. It is compatible with the stable `magent.task.v2`, event, memory, OAP 1.0, and AGS 1.0 contracts.

## Major additions

- A first-class workspace with bounded file search and previews, context selection, uploads, Git status/diffs/staging, branch and worktree management, adjacent-project launch commands, and GitHub/GitLab review handoff through their official CLIs.
- Governed graph schedules. Every graph is validated and planned before scheduling; graphs containing human gates wait for explicit approval at every due run.
- Group sessions for two to five OAP identities in sequential, parallel, or coordinator mode, with speaker attribution and separate durable tasks.
- Per-session permission presets, transcript fork/compact/export, searchable project/session/profile/run commands, and configurable keyboard shortcuts.
- A Tools & Extensions center for tool readiness, gateway health, MCP, skills, plugins, and integrity metadata.
- A deliberately narrow extension API and an authenticated HTTPS JSON-RPC client for remote MagAgent runtimes. Remote access tokens are memory-only.
- System/light/dark appearance modes, accent selection, reduced-motion support, a render recovery boundary, and optional keep-awake during active work.
- Lazy-loaded large views, bounded transcripts and command output, paged workspace lists, and 500-node graph performance budgets.

## Security and reliability

- Native workspace commands confine all paths to the selected project and reject symlink escapes.
- The command console parses an argument vector and never invokes a shell; redirects, pipes, substitutions, and control operators are inert arguments.
- Uploads, previews, inline context, command output, timeouts, file counts, and transcript rendering are bounded.
- State schema 2 records migrations and creates a one-time `command-center.v1.sqlite3.backup` before upgrading an existing v1 database.
- Project and user extensions cannot register without an explicit trust grant.
- Release CI generates a CycloneDX SBOM, audits dependencies, and attests tagged installer provenance.

## Release-candidate limits

- The desktop installers are not Apple-notarized or Windows code-signed until project signing credentials are configured.
- Remote mode is a client contract. Operators must supply an authenticated compatible JSON-RPC gateway; Command Center does not expose a network listener.
- Schedules run while Command Center is open. An unattended daemon is intentionally outside this release candidate.

## Validation gates

The candidate is accepted only after formatting, ESLint, TypeScript, unit/component tests with coverage thresholds, production build, Playwright browser-preview smoke tests, Rust formatting/tests/checks, and all four native packaging jobs pass. See [TESTING.md](TESTING.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
