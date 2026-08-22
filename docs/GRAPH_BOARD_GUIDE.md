# Graph Board Guide

Graph Board is Mag Command Center's visual editor and execution cockpit for portable Agentic Graph Specification (AGS) 1.0 workflows. It is separate from the MagGraph memory browser: MagGraph stores durable knowledge as Markdown nodes, while an Agentic Graph declares bounded executable work, dependencies, outputs, acceptance criteria, budgets, and human gates.

## Create a workflow

Open **Graph Board** and either enter a goal, choose a bundled workflow template, load a trusted plugin template, or open an existing `.agraph.yaml`, `.agraph.yml`, or `.agraph.json` file. Deterministic generation is local and quota-free. Planning-model generation uses the configured `review` model role, returns structured JSON, repairs validation failures, and never saves or executes its result automatically.

The **+ Card** menu creates schema-valid `task`, `decision`, `gate`, `loop`, `map`, and `subgraph` starters. Changing type replaces incompatible type-specific fields after confirmation. Duplication preserves the node contract; renaming is delegated to MagAgent so dependencies, edges, entrypoints, AGX expressions, output references, and fallback-node references remain consistent.

## Edit and navigate

The inspector covers inputs, outputs, success criteria, intelligence, tools, permissions, workspace mode, retry policy, limits, estimates, labels, guards, and each specialized node block. Uncommon structures remain in disclosures. Selecting an OAP profile shows its effective provider, model, tools, permissions, network ceiling, and any authority narrowing. Tool or network mismatches are shown before validation.

Columns are computed topological stages. Cards in one column may run in parallel. Dependencies, not position, control execution. Use Alt+Up or Alt+Down on a focused card to change presentation order without changing the portable graph. Filters, collapsed stages, compact density, labels, multi-select, undo, and redo support larger workflows. At 500 nodes the board switches to a compact list to keep navigation responsive.

The **Map** view shows incoming and outgoing relationships and supports keyboard-operable creation and removal of sequence, conditional, and failure edges. Diagnostics highlight cycles, unknown dependencies, unreachable nodes, and disconnected outputs.

## Source, drafts, and conflicts

The advanced **Source** view round-trips JSON files as JSON and YAML files as YAML. Applying source changes updates the structured editor; MagAgent remains the strict validator. A structured diff is shown before overwriting an existing file.

Unsaved drafts autosave to Command Center's native SQLite state store, keyed by project and graph path/draft identity. They recover after restart. Recent and pinned graphs are project-scoped. Leaving Graph Board warns when a draft has not been written to its graph file. While a saved graph is open, Command Center checks its digest; external changes offer reload, compare, or save-as instead of overwriting silently.

## Agent-assisted changes

Enter a request such as “add verification,” “reduce cost,” “increase parallelism,” or “add a human gate.” MagAgent sends bounded graph context and the AGS authoring schema to the configured planning model. The response must pass strict validation and repair attempts before Command Center displays it. Review each node-level change and accept selected changes or reject the proposal. Accepted changes record the proposing model and planning role in the review UI and still require save, validation, and execution review.

Enabled plugin graph templates are exposed only when the plugin is valid and declares reviewed or trusted provenance. Template cards show the plugin, trust state, and digest before use.

## Validate and run

**Validate** sends the unsaved document to `magent graph preview` and returns a digest-bound execution plan. Any edit makes that plan stale. Save atomically, review projected cost, worst-case node executions, parallelism, profiles, and every declared human gate, then start the exact saved graph.

Runs attach to MagAgent's durable task/event bridge. Card state reflects queued, running, awaiting-human, succeeded, failed, skipped, and cancelled child tasks. The cockpit exposes attempts, usage, changed files, audit context, bounded logs, pause/resume at safe node boundaries, cancellation, and digest-safe resume of failed runs. Every run record preserves the graph digest and an immutable graph snapshot.

The `x-magagent-profile` extension assigns an OAP profile to one node. MagAgent resolves it at execution time and intersects requested authority with the harness ceiling. If the extension is absent, the run-level profile applies. A missing profile or authority mismatch fails closed; profiles never widen graph or harness permissions.

## Verification

Run:

```bash
npm test
npm run build
cd src-tauri && cargo test --lib
```

Release qualification additionally runs native packaging and smoke tests on Linux, Windows, macOS Intel, and macOS Apple Silicon through `.github/workflows/desktop-build.yml`. Review light and dark screenshots at wide, laptop, and minimum supported sizes before publishing.
