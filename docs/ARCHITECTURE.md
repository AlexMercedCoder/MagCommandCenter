# Architecture

## 1.0 release-candidate topology

The React renderer is organized around lazy workspace surfaces and typed clients. `desktop.ts` selects either the native Tauri invoke transport or an authenticated remote JSON-RPC transport. `magent.ts` owns the stable CLI contract, while `workspace-client.ts` owns files, Git, worktrees, bounded commands, and adjacent projects. Extensions register through a small renderer API with an explicit trust requirement.

The Rust backend is split between the MagAgent/state bridge in `lib.rs` and the workspace security boundary in `workspace.rs`. No general shell bridge is exposed. Native commands canonicalize project paths, pass argument arrays to child processes, bound IO and runtime, and return serializable typed records.

SQLite app state uses schema version 2 with an `app_migrations` ledger. The v1-to-v2 path checkpoints WAL and creates a one-time backup before migration. MagAgent configuration, credentials, tasks, graphs, profiles, memory, and project files remain external sources of truth.

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
directory. The database uses WAL mode and a versioned schema. Existing local browser
values are read once as migration fallbacks, then projects, sessions, chat history,
draft preferences, command history, and saved queries use the native store.

MagAgent task events remain in MagAgent's durable runtime database. Command Center
polls that authoritative ledger rather than copying task truth into its own store.
Active tasks discovered at startup are labeled as recovered and reconnect to their
event cursor. They remain under MagAgent's durable lifecycle authority.

## Process lifecycle

Every streamed ask is attached to a pre-created MagAgent task ID. Tauri registers the
spawned child under a separate stream ID. Cancelling from chat first terminates that
native child and then records the durable task cancellation, preventing orphaned CLI
processes while preserving an auditable final state.

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
