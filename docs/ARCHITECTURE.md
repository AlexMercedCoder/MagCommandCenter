# Architecture

Mag Command Center is a presentation and native-lifecycle client for MagAgent. It
does not reimplement provider, permission, task, memory, plugin, or graph rules.

## Runtime layers

1. React panels render project, chat, configuration, memory, SQLite, plugin, and
   workbench workflows.
2. `src/magent.ts` is the typed MagAgent client. It normalizes command failures and
   owns the versioned `magent.task.v1` and `magent.task-event.v1` desktop contract.
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

## Compatibility

Human-readable CLI output is retained only in the collapsed diagnostics inspector.
New desktop workflows should use typed JSON commands and structured task events. If
a cross-project feature needs new business logic, implement it in MagAgent or
MagGraph first and expose it through the machine API.
