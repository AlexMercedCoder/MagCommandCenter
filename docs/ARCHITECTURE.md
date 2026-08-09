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

## Process lifecycle

Every streamed ask is attached to a pre-created MagAgent task ID. Tauri registers the
spawned child under a separate stream ID. Cancelling from chat first terminates that
native child and then records the durable task cancellation, preventing orphaned CLI
processes while preserving an auditable final state.

## Compatibility

Human-readable CLI output is retained only in the collapsed diagnostics inspector.
New desktop workflows should use typed JSON commands and structured task events. If
a cross-project feature needs new business logic, implement it in MagAgent or
MagGraph first and expose it through the machine API.
