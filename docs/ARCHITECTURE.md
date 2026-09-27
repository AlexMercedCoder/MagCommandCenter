# Architecture

## 1.0 release-candidate topology

The React renderer is organized around lazy workspace surfaces and typed clients. `desktop.ts` selects either the native Tauri invoke transport or an authenticated remote JSON-RPC transport. `magent.ts` owns the stable CLI contract, while `workspace-client.ts` owns files, Git, worktrees, bounded commands, and adjacent projects. Extensions register through a small renderer API with an explicit trust requirement.

The Rust backend is split between the MagAgent/state bridge in `lib.rs` and the workspace security boundary in `workspace.rs`. No general shell bridge is exposed. Native commands canonicalize project paths, pass argument arrays to child processes, bound IO and runtime, and return serializable typed records.

SQLite app state uses schema version 4 with an `app_migrations` ledger, an `app_meta` open marker, and `workspace_command_grants` (console programs approved per project). Upgrading from an older schema checkpoints WAL and creates a one-time backup first. MagAgent configuration, credentials, tasks, graphs, profiles, memory, and project files remain external sources of truth.

### Harness adapters

`src/harness/` defines `HarnessAdapter`: `detect`, `contracts`, `ask` (spawn and
stream), `decide` (AAIS decision to stdin), `cancel` (process-tree Stop), and a
`capabilities` record (streaming, approvals, cancel, durable tasks, profiles, graphs,
memory, remote). MagAgent (`magent-adapter.ts`) is the default and supports everything.
Loro (`loro-adapter.ts`, experimental) runs `loro run --json --approval-stdio` in the
project folder through the native `run_harness_stream` command (`src-tauri/src/harness.rs`),
which writes the prompt to an owner-only temp file for `--prompt-file` and deletes it
afterwards, then reuses the same stream relay, approval capture, and Stop as MagAgent.
Chat sessions record their harness; group sessions, graphs, durable tasks, and memory
evidence remain MagAgent features.

### Diff review and editor handoff

`src/lib/diff.ts` parses unified diffs (Git and MagAgent checkpoint output) into files,
hunks, and numbered lines; `src/components/diff-review.tsx` renders them for Source
control and the Workbench checkpoint view. Editor handoff goes through the native
`open_in_editor` command (`src-tauri/src/editor.rs`): the renderer sends a project, a
path, an optional line, and an editor name from a closed set. Native code canonicalizes
the path, refuses anything outside the project or not a regular file, resolves the
editor itself, and spawns it detached with null stdio.

### Renderer state and layout

`App.tsx` is only the shell: rail, context sidebar, header, toasts, approvals, and the
command palette. `app/view-router.tsx` renders the active view. State lives in small
zustand stores instead of one component:

- `stores/app-store.ts`: navigation, appearance, projects, MagAgent detection, command
  history, diagnostics, and toasts. `stores/magent-actions.ts` holds the shared command
  runners (`executeJson`, `detectMagent`, readiness checks).
- `stores/use-persistence.ts`: loads persisted fields once, then writes each back when it
  changes; chat sessions and transcripts are keyed by project and session.
- Feature stores and their actions: `features/chat` (sessions, asks, group runs),
  `features/graphs/board` (the Graph Board document, undo history, runs; its effects
  live in `effects.ts`), `features/memory`, `features/sqlite`, `features/plugins`,
  `features/config`, `features/research`, `features/workbench`, and
  `features/workspace` (file, Git, console, and source-hosting panels).
- Long-lived runtimes that poll or run timers (tasks, profiles, schedules, checkpoints)
  are created once in `App` and shared through `app/runtime-context.tsx`.

Actions read the stores directly (`useXStore.getState()`), so an ask or graph run that
outlives its view keeps updating the right session. No component is over 800 lines, and
ESLint enforces `react-hooks/exhaustive-deps` and `@typescript-eslint/no-unused-vars`.

`src/styles.css` imports the feature style sheets in `src/styles/` in cascade order. The
numbered prefix is the order and the name is the surface (for example
`18-graph-canvas-graph.css`). Later files refine earlier ones, so keep new rules in the
file for their surface and do not reorder the list.

Large views—Workspace, Tools, Profiles, Graph Board, Runs, and Docs—are code-split. File lists and transcripts are render-bounded, and graph analysis has an automated 500-node performance budget. A top-level error boundary provides recovery from renderer failures.

See [WORKSPACE_AND_AUTOMATION.md](WORKSPACE_AND_AUTOMATION.md), [EXTENSIONS_AND_REMOTE.md](EXTENSIONS_AND_REMOTE.md), and [SECURITY.md](SECURITY.md) for boundary details.

## Agentic Graph Workbench

The desktop app does not implement graph semantics. Its Graph Board uses MagAgent's `magent.agentic-graph-authoring.v2` JSON-stdin contract to discover the schema, templates, and OAP profiles, normalize files, validate and plan unsaved drafts, safely rename references, review model proposals, and atomically save with optimistic digest checks. Command Center computes only presentation layout and local diagnostics; MagAgent remains authoritative for validation and execution. Per-card OAP assignment is stored in the Graph Spec extension `x-magagent-profile` and resolved by MagAgent at runtime.

Execution streams `magent.graph-event.v1` JSONL through the existing cancellable Tauri process bridge. The board disables execution while a draft is unsaved, presents a final confirmation, and passes only explicitly reviewed gate IDs. `magent.graph-status.v1` restores the graph task and child cards after reconnect, while selective retry passes one or more failed node IDs and lets MagAgent invalidate their downstream dependents. The compact Workbench runner remains available for direct file-oriented use.

Task states include the additive AGS states `ready`, `awaiting_human`, `succeeded`, and `skipped` while retaining MagAgent's earlier states for compatibility.

Mag Command Center is a presentation and native-lifecycle client for MagAgent. It
does not reimplement provider, permission, task, memory, plugin, or graph rules.

## Open Agent Profile Center

Profile Center consumes MagAgent's `magent.oap-profile.v1` contract. `agent schema`
provides the OAP JSON Schema and locally available providers, models, tools, packs,
skills, MCP servers, templates, and profiles. Preview and apply send JSON over the
Tauri child's stdin, keeping role instructions out of process arguments and command
history. MagAgent remains responsible for validation, inheritance, policy narrowing,
atomic writes, conflict detection, secret-safe export, checkpoints, and rollback.

Desktop chat sessions persist a profile name and profile digest. The digest is a pin,
not an authorization token: it lets the UI report revision drift before an existing
conversation adopts changed behavior. Project crews are desktop presentation state;
the selected coordinator becomes the default profile for new project chats. Every
actual ask, goal, research run, recipe plan, or graph execution passes the profile name
back to MagAgent, where effective authority is resolved again.

## Runtime layers

1. React panels render project, chat, agent profile, configuration, memory, SQLite, plugin, and
   workbench workflows.
2. `src/magent.ts` is the typed MagAgent client. It normalizes command failures and
   owns the versioned `magent.task.v2` and `magent.task-event.v1` desktop contract. The client continues to accept v1 task snapshots during migration.
3. `useExecutionRuntime` creates tasks before model work begins, polls append-only
   events by cursor, and exposes pause, resume, cancel, and retry controls.
4. Tauri owns child processes, cancellation, project inspection, setup allowlists,
   and desktop persistence.
5. MagAgent owns all agent behavior and MagGraph owns graph data and retrieval.

## Persistence

Desktop state is stored in `command-center.sqlite3` under the OS application-data
directory. The database uses WAL mode and a versioned schema (currently 4). The app opens
and migrates it at startup, before the renderer loads any state, and records the app
version in `app_meta.last_opened_version`. A database written by a newer schema is
refused with an error instead of being silently re-stamped. Existing local browser
values are read once as migration fallbacks, then projects, sessions, chat history,
draft preferences, command history, and saved queries use the native store.

MagAgent task events remain in MagAgent's durable runtime database. Command Center
polls that authoritative ledger rather than copying task truth into its own store.
Active tasks discovered at startup are labeled as recovered and reconnect to their
event cursor. They remain under MagAgent's durable lifecycle authority.

## Managed MagAgent install

Experimental. `src-tauri/src/managed_install.rs` provisions a private MagAgent on request
in `<app local data>/managed-magent/`:

1. **uv**: `MCC_UV_BIN`, else a previously downloaded private uv, else an installed uv
   (`PATH` plus `~/.local/bin`, `~/.cargo/bin`, `/opt/homebrew/bin`, `/usr/local/bin`),
   else uv 0.6.14 from `github.com/astral-sh/uv/releases`. The download is HTTPS only,
   capped at 64 MiB, and verified in memory against the per-platform SHA-256 pinned in
   source (`pinned_uv_sha256`) before anything is written. Only the `uv` executable is
   extracted (archive paths and symlink entries are ignored), through a fresh
   `create_new` file renamed into place. The folder is owner-only (0700).
2. **Python**: `uv python install 3.12` with `UV_PYTHON_INSTALL_DIR` and
   `UV_PYTHON_BIN_DIR` inside the folder.
3. **Environment**: `uv venv envs/env-<ms> --python 3.12 --python-preference only-managed`.
4. **MagAgent**: `uv pip install --python <env python> mag-agent==1.4.0` (the pin is
   tested to equal `magAgentCompatibility.minimumVersion`).
5. **Verify**: `<env>/bin/magent --version`, then `managed.json` is written atomically,
   the previous environment is deleted, and uv's package cache is dropped.

Every uv call uses `--no-config`, a private `UV_CACHE_DIR`, and removes `VIRTUAL_ENV`,
`UV_PYTHON`, and index-URL variables, so user configuration cannot redirect it. Steps run
through `process_tree`, so Cancel stops uv and anything it started. A failed or
cancelled install deletes its new environment and never writes the manifest. The
previous install stays active. Progress is pushed as `managed-install-progress` events
(step start and finish, plus each output line). `magent_binary()` prefers
`MAGENT_BIN`, then a completed managed install, then the usual user locations.

**Trade-offs.** The alternatives were:

- **Python inside the installer.** This means a python-build-standalone runtime plus
  MagAgent and its dependencies in every bundle. It adds about 100 MB or more to every
  download, even for users who already have MagAgent. It needs per-platform wheels at
  build time, and MagAgent upgrades would ship only with app releases.
- **A frozen Tauri sidecar** (PyInstaller or similar `magent` executables). This is
  cleaner to launch, but MagAgent loads plugins, tool packs, and optional extras at
  runtime, which frozen builds handle poorly. It also needs a separate signed build per
  target triple.

The managed install keeps the installer small, works the same on every platform uv
supports, and can be upgraded or removed independently. The costs are that it needs a
network connection on first use, and that `mag-agent` and its dependencies come from
PyPI over TLS without hash pinning. The uv archive digests are pinned in source and
must be updated with `PINNED_UV`. uv covers Linux, macOS, and Windows on x86_64 and aarch64;
other platforms need an installed uv. Overrides for testing and support come only from
the app's environment (`MCC_UV_BIN`, `MCC_MANAGED_PYTHON`, `MCC_MANAGED_MAGENT_SPEC`),
never from the renderer.

## Git in untrusted projects

An agent working in a project can write its `.git/config`, and Git runs programs named
there during ordinary read-only commands. `src-tauri/src/git_guard.rs` builds every Git
process Command Center starts (Git views, project inspection, and console Git) with
command-line overrides for `core.fsmonitor`, `core.hooksPath`, `diff.external`,
`log.showSignature`, the pager, and submodule recursion, blanks filter drivers defined in
the repository's own config, and adds `--no-ext-diff --no-textconv` to diff-producing
subcommands. See [THREAT_MODEL.md](THREAT_MODEL.md).

## Process lifecycle

Every streamed ask is attached to a pre-created MagAgent task ID. Tauri registers the
spawned child under a separate stream ID. Cancelling from chat first stops that native
process tree and then records the durable task cancellation, preventing orphaned CLI
processes while preserving an auditable final state.

`src-tauri/src/process_tree.rs` owns the tree boundary. On macOS and Linux each MagAgent
child (and each workspace command) starts as the leader of a new process group; Stop
sends `SIGTERM` to the group, waits up to three seconds, then sends `SIGKILL` to anything
left. On Windows the child is assigned to a Job Object with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; Stop terminates the job, and closing the job handle
when the run ends or the app exits terminates any process the run left behind. (On macOS
and Linux, processes a finished run deliberately left running are not touched.) Quitting
the app kills every run it still tracks. Workspace commands that hit their timeout are
stopped the same way, so a test runner's child processes cannot keep the output pipe open.

Approval state is pushed, not polled: whenever a validated request or its matching
receipt changes the native approval state, Rust emits an `approval-state` event with
the full snapshot (the same shape as the `approval_snapshot` command). The renderer
fetches one snapshot when it subscribes and again on window focus, then relies on the
events. Decisions that land between two old 800 ms polls now reach the dialog and the
receipt toast immediately.

When a run exits while it still owns pending AAIS approval requests, the native approval
state moves each one to an `interrupted` outcome instead of dropping it silently. The
stream receives a status line, and the renderer shows an "Approval interrupted" notice
saying nothing was approved.

All child-process waits run through Tauri's blocking worker pool. No long-running
`magent` or setup command may synchronously occupy the IPC handler, because doing so
would prevent the renderer from processing timers, stream events, AAIS approvals, or
cancel requests even while the child continued changing project files. Streamed runs
also emit a bounded two-second lifecycle heartbeat. Heartbeats communicate liveness,
not model chain-of-thought, and supplement rather than replace structured tool and task
events.

Several tasks may run concurrently. UI updates are scoped to the project/session that
launched each task; a completion that arrives while another workspace is active is
written directly to the originating SQLite chat record. Switching projects therefore
does not cancel or misroute background work.

Artifact reads canonicalize both the project root and requested file, reject files
outside the project, and cap previews at 2 MiB. HTML and SVG render in a sandboxed
iframe. Diagnostic exports recursively redact sensitive key names and secret-like
tokens before writing an opt-in JSON bundle.

Checkpoint comparison/restoration and local session messaging use JSON CLI contracts;
the desktop never reads or mutates MagAgent workbench files directly. Restore requires
an explicit confirmation. Peer messages remain untrusted coordination input and cannot
carry approvals or permission state.

`src/lib/performance.ts` records bounded, local-only measurements for startup, project
switching, first task activity, memory search, and SQLite queries. Measurements are
kept in memory and leave the machine only when the user explicitly saves a redacted
diagnostics bundle.

The Projects dashboard consumes `mag.ecosystem-readiness.v1` from `magent system
ecosystem-report`. Command Center renders local checks and external gates separately;
it does not infer 1.0 readiness from the local `ok` field or trigger live provider tests.
Its Environment Center composes three non-mutating machine reports: `tools doctor`,
`provider detect`, and `cache doctor --json`. It displays only credential presence,
never credential values. Startup compatibility additionally requires desktop CLI v1,
task v2, task-event v1, and memory-recall v2 from `magent system contracts`.

## Compatibility

Human-readable CLI output is retained only in the collapsed diagnostics inspector.
New desktop workflows should use typed JSON commands and structured task events. If
a cross-project feature needs new business logic, implement it in MagAgent or
MagGraph first and expose it through the machine API.

Graph Board follows that boundary. MagAgent owns schema-derived node templates, strict validation,
safe reference-aware renaming, planning-model proposal repair, digest-guarded saves, selective gate
approval, run snapshots, and durable parent/child tasks. Command Center owns recoverable presentation
state, filters, labels, source/diff review, accessible dependency controls, and event rendering.
Presentation order and Command Center draft metadata never alter AGS dependency semantics.
