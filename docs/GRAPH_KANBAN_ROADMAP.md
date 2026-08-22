# Graph Kanban Roadmap

> Implementation status: completed on 2026-08-22. The roadmap remains as the acceptance record.
> Local frontend, MagAgent contract, accessibility, scale, and native-library validation are
> recorded in `docs/TESTING.md`; cross-platform installer jobs remain release-environment gates.

## Purpose

Graph Board is Mag Command Center's visual authoring and execution surface for Agentic Graph
Specification 1.0 workflows. Each card represents an executable graph node, explicit
dependencies determine execution order, and cards in the same computed stage may run in
parallel. MagAgent remains authoritative for graph validation, planning, profile resolution,
permissions, persistence, and execution.

This document records the remaining work after the initial Graph Board foundation. It is the
working roadmap for completing the feature, not a promise that card position will ever replace
explicit Graph Spec dependencies.

## Foundation Completed

- A dedicated Graph Board workspace exists outside the denser general Workbench.
- Users can load Agentic Graph YAML or JSON files.
- Users can generate a conservative inspect, implement, and verify draft from a goal.
- Nodes render as cards grouped into computed topological execution stages.
- Parallel nodes appear in the same stage.
- Users can add task cards, edit titles and instructions, remove cards, and edit dependencies.
- Dependency cycles are detected immediately in the client.
- Cards can be assigned to discovered Open Agent Profiles.
- Profile assignment uses the portable `x-magagent-profile` Graph Spec extension.
- Unsaved drafts can be strictly validated and planned through MagAgent over JSON stdin.
- Graph files are saved atomically with project containment and digest conflict protection.
- Editing a graph invalidates the displayed plan and disables execution until the graph is saved.
- Saved graphs can run through MagAgent with streamed activity.
- Unit and component coverage exists for stage layout, parallel cards, cycle detection,
  dependency cleanup, JSON-stdin contracts, digest checks, and profile assignment.
- Repository and in-app documentation describe the initial workflow.

## Milestone 1: Complete Card Authoring

### Node templates

- Add an explicit card-creation menu instead of creating task nodes only.
- Provide valid templates for `task`, `decision`, `gate`, `loop`, `map`, and `subgraph` nodes.
- Prevent changing a node type without migrating or replacing incompatible type-specific fields.
- Add duplicate-card and duplicate-subgraph actions.
- Add safe node ID rename support that updates dependencies, edges, expressions, entrypoints,
  outputs, and references through MagAgent rather than client-side string replacement.

### Schema-driven inspector

- Build editors for inputs, outputs, success criteria, intelligence tier, tool requirements,
  permissions, workspace mode, retry policy, limits, estimates, labels, and guards.
- Add focused editors for decisions, gates, loops, maps, and subgraphs.
- Use the schema and choices returned by `magent.agentic-graph-authoring.v2`; do not duplicate
  normative Graph Spec validation rules in TypeScript.
- Show effective profile authority beside requested node tools and permissions.
- Flag profile/tool/network mismatches before the user reaches execution review.
- Keep uncommon fields in an Advanced disclosure so the primary inspector remains approachable.

### Board ergonomics

- Add keyboard-accessible card reordering within a stage for presentation only.
- Add optional user-defined lanes or labels that do not alter execution dependencies.
- Add card filtering by type, profile, label, validation state, and execution state.
- Add collapse controls for large stages and a compact-card density option.
- Add undo and redo for graph edits.
- Add multi-select for bulk profile, label, and constraint changes.

## Milestone 2: Dependency Visualization and Source Control

### Dependency map

- Add a synchronized node-and-edge view using a proven graph UI library such as React Flow.
- Support keyboard-operable edge creation and deletion in addition to pointer interactions.
- Show outgoing dependents as well as incoming dependencies in the card inspector.
- Visually distinguish sequence, conditional, error, and other explicit edge kinds.
- Highlight cycles, unreachable nodes, unknown references, and disconnected outputs.
- Preserve the board as the default workflow view; use the map for complex branching.

### Source and diff views

- Add synchronized YAML/JSON source viewing with validation pointers.
- Prefer structured form edits; place direct source editing behind an explicit advanced mode.
- Show the source diff before overwriting an existing graph.
- Detect external file changes while a graph is open and offer reload, compare, or save-as.
- Tie every displayed plan to its exact graph digest and visibly mark stale plans.
- Keep Command Center layout metadata separate from the portable graph document, unless stored
  in a documented namespaced extension.

### Draft persistence

- Autosave recoverable drafts to Command Center's native SQLite store.
- Key drafts by project and graph path or draft ID.
- Restore drafts after application restart or process failure.
- Add recent graphs, pinned graphs, and project graph discovery.
- Prompt before abandoning dirty changes when switching projects, graphs, or views.

## Milestone 3: Agent-Assisted Graph Design

### Generation

- Retain deterministic generation as a fast, quota-free starting option.
- Add model-backed graph generation using the configured planning model and selected OAP profile.
- Send bounded project context and the Graph Spec authoring contract to the generator.
- Require structured graph output, strict validation, and repair attempts before showing a draft.
- Never save or execute a generated graph without user review.

### Conversational editing

- Let users ask MagAgent to improve the whole graph, one stage, or selected cards.
- Return a structured graph patch with an explanation rather than silently replacing the graph.
- Provide side-by-side review with accept-all, reject-all, and per-change decisions.
- Support requests such as adding verification, reducing cost, increasing parallelism, assigning
  specialist profiles, or adding human approval before destructive work.
- Record which profile and model proposed each accepted graph change.

### Templates and examples

- Add a template gallery using the packaged release-prep, bug-triage, docs-audit, dependency
  upgrade, and test-repair examples.
- Allow users and plugins to contribute trusted graph and node templates.
- Show required tools, profiles, permissions, expected cost, and conformance level before use.

## Milestone 4: Execution Cockpit

### Durable execution

- Run graphs through MagAgent's durable task and event bridge rather than a single foreground
  streamed process.
- Allow graph runs to continue while users switch projects, chats, or application views.
- Restore active and completed graph runs after restarting Command Center.
- Add pause, resume, cancel, and retry controls where runtime semantics permit them.
- Support retrying a failed node or branch without rerunning successful work when the graph digest
  and run record allow safe resume.

### Live card state

- Overlay `queued`, `running`, `awaiting_human`, `succeeded`, `failed`, `skipped`, and `cancelled`
  states directly on cards.
- Show elapsed time, attempt count, token and cost usage, output availability, and failure summary.
- Follow the active card without forcing focus changes or blocking board interaction.
- Let users open bounded logs, outputs, artifacts, and diagnostics from the corresponding card.
- Preserve an immutable graph snapshot and digest for every run.

### Human gates and safety

- Replace blanket `--yes` execution with a dedicated gate-review experience.
- Let users approve or reject individual gates when they become ready.
- Show the exact operation, profile, tools, permissions, and downstream nodes affected by a gate.
- Add configurable approval policy without allowing a graph to widen profile or harness authority.
- Surface cost, time, node-execution, and parallelism limits before starting a run.
- Require renewed review when graph content, profile digests, or effective permissions have changed.

## Milestone 5: Quality, Scale, and Release Readiness

### Testing

- Add round-trip fixtures for every supported node and edge type in YAML and JSON.
- Add CLI integration coverage for schema, inspect, preview, apply, conflict, and generated drafts.
- Add runtime tests proving different parallel nodes receive their assigned profiles without state
  leaking between tasks.
- Add component tests for every inspector section, undo/redo, dirty-state navigation, source diff,
  draft recovery, and gate decisions.
- Add end-to-end Tauri tests for open, edit, validate, save, restart, run, cancel, resume, and
  external-file conflict workflows.
- Add accessibility checks for keyboard card navigation, dependency editing, map alternatives,
  focus restoration, status announcements, and color-independent execution states.
- Capture and review light and dark screenshots at wide desktop, standard laptop, and minimum
  supported window sizes.

### Performance

- Set an interaction target of smooth editing for at least 100 nodes.
- Add virtualization or compact list fallback for graphs approaching 500 nodes.
- Keep topological layout and diagnostics incremental after individual edits.
- Avoid rerendering every card when one inspector field changes.
- Measure graph load, layout, validation, source serialization, and live event rendering.
- Bound retained live logs and activity events without dropping durable runtime records.

### Documentation and release

- Add a complete Graph Board guide with a first workflow and profile-assignment example.
- Document the difference between MagGraph memory graphs and executable Agentic Graphs.
- Add screenshots and a short generate, edit, validate, and run walkthrough.
- Document the `x-magagent-profile` extension and fallback behavior in MagAgent and Command Center.
- Update in-app Help, architecture, testing, distribution, release checklist, and compatibility
  documentation before release.
- Qualify the corresponding MagAgent authoring contract release before raising Command Center's
  minimum supported MagAgent version.
- Run Linux, macOS Intel, macOS Apple Silicon, and Windows artifact builds and smoke tests.

## Recommended Implementation Order

1. Finish valid node templates and schema-driven card editing.
2. Add draft recovery, external-change handling, and source diff review.
3. Add dependency-map visualization and large-graph navigation.
4. Add model-backed generation and reviewable conversational graph patches.
5. Move graph execution onto the durable task/event bridge with card-level state.
6. Replace blanket gate approval with individual gate interaction.
7. Complete cross-platform, accessibility, performance, and visual release qualification.

This sequence makes authoring trustworthy before adding more automation, then makes execution
observable before presenting Graph Board as a finished daily-driver workflow surface.
