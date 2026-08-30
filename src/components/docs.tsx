import {
  BookOpen,
  Brain,
  Database,
  MessageSquareText,
  Plug,
  Settings2,
  ShieldCheck,
  UserRoundCog,
  Workflow,
} from "lucide-react";

const docs = [
  {
    title: "First Run",
    icon: ShieldCheck,
    items: [
      "Open Setup to detect MagAgent and verify the minimum desktop API version.",
      "Use pipx install/upgrade for the mag-agent PyPI package when possible; user-scoped pip is available as a fallback.",
      "The setup bridge only permits MagAgent bootstrap commands, not arbitrary shell execution.",
      "Setup diagnostics explain missing PATH, outdated MagAgent, and permission failures before users need to inspect raw command output.",
    ],
  },
  {
    title: "Projects",
    icon: Workflow,
    items: [
      "Open a folder to make it the active MagAgent project.",
      "Pin daily projects and use project health to inspect git status, detected frameworks, package manager, likely test commands, and recommended next action.",
      "Readiness runs through the installed MagAgent CLI and reflects the same config the terminal uses.",
      "Ecosystem Check generates deterministic local component evidence and lists external release gates without spending provider quota.",
    ],
  },
  {
    title: "Workspace and Git",
    icon: Workflow,
    items: [
      "Workspace search, previews, uploads, and selected agent context are project-confined and size bounded.",
      "The Git surface supports working/staged diffs, stage, unstage, confirmed discard, branches, and disposable worktrees.",
      "The command console launches an argument vector without a shell, so pipes, redirects, and substitutions are never interpreted.",
      "GitHub and GitLab review handoff uses an already-authenticated gh or glab CLI; Command Center never reads those credentials.",
    ],
  },
  {
    title: "Agent Profiles",
    icon: UserRoundCog,
    items: [
      "Open Agents to create, inspect, clone, import, export, or delete Open Agent Profile v1 identities through MagAgent's machine API.",
      "The guided builder covers identity, role, provider and model, tool packs, permissions, network access, skills, MCP servers, memory, delegation, context, hooks, and writeback.",
      "Review Effective Authority before saving. Requested settings may be narrowed by inheritance, enabled tools, parent agents, and harness policy.",
      "A profile controls agent behavior and narrows authority. It is not a user account, project, credential store, or filesystem sandbox.",
      "Assign profiles to a project crew and choose a coordinator. New project chats use that coordinator unless a session selects another profile.",
      "Use for Gateways assigns the profile to new Slack, Discord, and Telegram sessions through the same MagAgent config used by the CLI.",
      "Chat sessions pin the profile digest and warn when a newer revision exists, so an existing conversation does not silently change identity.",
      "Profile edits preserve runtime state and create restorable checkpoints. State proposals remain in the Profile State Inbox until accepted or rejected.",
    ],
  },
  {
    title: "Chat Sessions",
    icon: MessageSquareText,
    items: [
      "Projects, named sessions, chat history, command history, and saved queries are stored in a versioned native SQLite database with migration from older browser-local state.",
      "Create, rename, delete, and switch sessions from the Agent Chat panel.",
      "Choose an agent profile beside the project and session controls. Asks, staged goals, research, recipes, and graph runs use that selected identity.",
      "Switch active projects directly from Agent Chat when you want to bounce between project sessions.",
      "The main Agent Chat view stays focused on conversation, composer, and live running status.",
      "Open Activity Details when you want the Run Cockpit, model rounds, tool counts, durations, slowest steps, permission friction, generated artifacts, raw stream, or JSON payload.",
      "Each ask creates a durable task before model work begins. The task strip shows structured lifecycle events and offers pause, resume, cancel, and retry controls.",
      "You can send another task or switch projects while work continues; completed responses return to their originating project and named session.",
      "Native cancellation terminates the Tauri-owned CLI child and records the durable task state so long-running work does not leave an orphan process.",
      "Enable task notifications from the bell button to receive completed, failed, or blocked updates.",
      "Select a changed-file chip to preview text, code, Markdown, images, or sandboxed HTML/SVG without leaving chat.",
      "After an app restart, unfinished durable tasks are labeled as recovered and can be inspected, resumed, retried, or cancelled.",
      "Use Stage Goal for larger tasks; it creates a cached MagAgent master plan and returns the saved `goal-run` preview/run commands in the chat.",
      "Group sessions run two to five pinned OAP identities sequentially, in parallel, or through a coordinator with attributed results.",
      "Fork, compact, or export a transcript, and select a session-scoped permission policy before running work.",
    ],
  },
  {
    title: "Graph Board",
    icon: Workflow,
    items: [
      "Open Graph Board to generate a reviewable Agentic Graph draft from a goal or load an existing `.agraph.yaml`, `.agraph.yml`, or `.agraph.json` file.",
      "Cards are executable graph nodes. Columns are computed execution stages; cards in the same column may run in parallel.",
      "Select a card to edit its instructions and explicit dependencies. Card position never silently changes execution behavior.",
      "Create schema-valid task, decision, gate, loop, map, and subgraph cards; changing type replaces incompatible fields after review.",
      "Use Board, accessible dependency Map, and synchronized YAML/JSON Source views. Unsaved drafts recover from native state, and external changes offer reload, compare, or save-as.",
      "The planning model can propose a strictly validated graph patch. Accept selected changes only; proposals never save or execute automatically.",
      "Large graphs support filters, labels, compact mode, stage collapse, undo/redo, multi-select, and a 500-node compact fallback.",
      "Assign any discovered Open Agent Profile to a card. MagAgent applies that profile's personality, provider, model, tools, and effective permissions only while that node runs.",
      "Validate creates a digest-bound plan from the unsaved draft. Editing invalidates that plan, and saving refuses stale overwrites when the file changed elsewhere.",
      "A graph must be saved before Run graph is enabled. Review each declared gate and execution limit before starting the digest-bound durable run.",
      "Live card states, bounded logs, usage, files, pause/resume boundaries, cancellation, and safe failed-run resume remain available in the execution cockpit.",
    ],
  },
  {
    title: "Workbench",
    icon: Workflow,
    items: [
      "Load file checkpoints, inspect unified diffs, and restore one checkpoint only after an explicit destructive-action confirmation.",
      "Find live local MagAgent sessions and send bounded coordination messages from Session Coordination.",
      "Peer messages cannot approve permissions, reveal hidden context, or bypass the receiving session's policy and sandbox.",
      "The dedicated Graph Board now owns visual graph authoring. Workbench retains the compact file-based graph runner for users who prefer direct graph files.",
    ],
  },
  {
    title: "Runs and Schedules",
    icon: Workflow,
    items: [
      "Runs consolidates active, attention, completed, and recovered durable tasks with usage, audit context, artifacts, and controls.",
      "Graph schedules are validated and planned before creation and run only while Command Center is open.",
      "Gate-free schedules may run automatically; graphs containing human gates wait for explicit approval at every due time.",
    ],
  },
  {
    title: "Configuration",
    icon: Settings2,
    items: [
      "Load guided settings from MagAgent's config schema.",
      "Save common provider, model, memory, and tool values without hand-editing config files.",
      "MagAgent 1.0.0 provides stable AGS 1.0, OAP 1.0, task-v2, provider qualification, prompt-cache diagnostics, capability checks, and explainable MagGraph memory contracts used by the cockpit.",
      "The Projects screen includes an Environment Center for providers, optional tool packs, prompt caching, and negotiated machine contracts.",
      "Use Advanced Dot Path only when you need to set a config value not shown in guided controls.",
      "Settings also controls native or authenticated remote execution, keep-awake behavior, system/light/dark appearance, accents, and keyboard shortcuts.",
    ],
  },
  {
    title: "Memory",
    icon: Brain,
    items: [
      "Use the Memory Browser top-down: search memories, select a node, inspect provenance, then preview edits before applying.",
      "Recall reasons, backlinks, and score evidence explain why hybrid retrieval selected a memory.",
      "Reviewed Batch previews and atomically applies several update, suppress, unsuppress, or merge operations.",
      "Memory inbox, suppress/unsuppress, merge, raw JSON, and preview output live in focused drawers so the main editor stays readable.",
      "Use Improve in Chat to ask MagAgent to rewrite or clarify selected memory before applying changes.",
      "Suppression is the recoverable delete workflow: suppress removes a node from recall, and Unsuppress restores it without discarding provenance.",
    ],
  },
  {
    title: "SQLite",
    icon: Database,
    items: [
      "Use the SQLite Browser top-down: find databases, load tables, click a table to draft a SELECT, then run paged results.",
      "Saved queries, table details, and export previews live in drawers so the query/result path remains clear.",
      "The export drawer prepares JSON or CSV text from the visible query result.",
    ],
  },
  {
    title: "Plugins",
    icon: Plug,
    items: [
      "Load installed plugins, select a plugin, and review capability, permission, trust, and contribution metadata.",
      "Install or import plugin sources only after reviewing the safety panel.",
      "Enable and disable installed packs through the same MagAgent plugin commands used by the CLI.",
    ],
  },
  {
    title: "Tools and Extensions",
    icon: Plug,
    items: [
      "Tools & Extensions reports tool doctor, gateway, plugin integrity, skill, and MCP inventory from the installed MagAgent.",
      "The renderer extension API accepts commands, inspectors, and navigation; user/project extensions require an explicit trust grant and are not a security sandbox.",
      "Remote runtime mode requires HTTPS outside loopback, authenticates every JSON-RPC request, keeps tokens memory-only, rejects redirects, and omits cookies.",
    ],
  },
  {
    title: "Diagnostics",
    icon: ShieldCheck,
    items: [
      "Use the bug button in the top bar to collect an opt-in diagnostics bundle under the OS application-data directory.",
      "The bundle includes redacted MagAgent system info, deep diagnostics, and recent durable task snapshots.",
      "Local startup, project-switch, first-activity, memory-search, and SQLite-query measurements are included with their documented budgets.",
      "Keys, tokens, passwords, authorization fields, credentials, and secret-like strings are removed before the file is written.",
    ],
  },
  {
    title: "Packaging",
    icon: BookOpen,
    items: [
      "GitHub Actions builds Linux, macOS Apple Silicon, macOS Intel, and Windows artifacts on platform-native runners after frontend and Rust tests pass.",
      "Tag builds matching v* publish a GitHub release, attach generated installers, generate a CycloneDX SBOM, and attest build provenance.",
      "The Tauri icon set includes PNG, ICNS, and ICO assets for cross-platform bundling.",
      "Unsigned macOS and Windows artifacts are expected until signing and notarization credentials are configured.",
      "In-app updater support should wait for signed updater artifacts and a stable HTTPS or GitHub-release-backed update endpoint.",
    ],
  },
];

const screenshots = [
  { title: "Projects", src: "/docs/screenshots/02-projects-light.png" },
  { title: "Agent Chat", src: "/docs/screenshots/03-agent-chat-light.png" },
  { title: "Memory", src: "/docs/screenshots/04-memory-light.png" },
  { title: "Docs Dark Mode", src: "/docs/screenshots/07-docs-dark.png" },
];

export function DocsPanel() {
  return (
    <section className="content-grid">
      <div className="panel hero-panel">
        <div>
          <p className="label">In-App Documentation</p>
          <h3>Operate Mag Command Center without leaving the cockpit.</h3>
          <p>
            These notes mirror the repository docs and focus on the workflows
            available in the current desktop build.
          </p>
        </div>
        <div className="stack">
          <strong>Source of truth</strong>
          <p>
            The desktop app shells out to the installed MagAgent CLI, so
            terminal and app workflows share the same config, memory, plugins,
            and project state.
          </p>
        </div>
      </div>
      <div className="panel screenshot-gallery">
        <div className="panel-heading">
          <h3>Screenshots</h3>
          <BookOpen size={20} />
        </div>
        <div className="screenshot-grid">
          {screenshots.map((screenshot) => (
            <figure key={screenshot.src}>
              <img
                alt={`${screenshot.title} screenshot`}
                src={screenshot.src}
              />
              <figcaption>{screenshot.title}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      {docs.map((section) => {
        const Icon = section.icon;
        return (
          <div className="panel doc-card" key={section.title}>
            <div className="panel-heading">
              <h3>{section.title}</h3>
              <Icon size={20} />
            </div>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
