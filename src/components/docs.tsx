import { BookOpen, Brain, Database, MessageSquareText, Plug, Settings2, ShieldCheck, Workflow } from "lucide-react";

const docs = [
  {
    title: "First Run",
    icon: ShieldCheck,
    items: [
      "Open Setup to detect MagAgent and verify the minimum desktop API version.",
      "Use pipx install/upgrade for the mag-agent PyPI package when possible; user-scoped pip is available as a fallback.",
      "The setup bridge only permits MagAgent bootstrap commands, not arbitrary shell execution.",
      "Setup diagnostics explain missing PATH, outdated MagAgent, and permission failures before users need to inspect raw command output."
    ]
  },
  {
    title: "Projects",
    icon: Workflow,
    items: [
      "Open a folder to make it the active MagAgent project.",
      "Pin daily projects and use project health to inspect git status, detected frameworks, package manager, likely test commands, and recommended next action.",
      "Readiness runs through the installed MagAgent CLI and reflects the same config the terminal uses."
    ]
  },
  {
    title: "Chat Sessions",
    icon: MessageSquareText,
    items: [
      "Projects, named sessions, chat history, command history, and saved queries are stored in a versioned native SQLite database with migration from older browser-local state.",
      "Create, rename, delete, and switch sessions from the Agent Chat panel.",
      "Switch active projects directly from Agent Chat when you want to bounce between project sessions.",
      "The main Agent Chat view stays focused on conversation, composer, and live running status.",
      "Open Activity Details when you want the Run Cockpit, model rounds, tool counts, durations, slowest steps, permission friction, generated artifacts, raw stream, or JSON payload.",
      "Each ask creates a durable task before model work begins. The task strip shows structured lifecycle events and offers pause, resume, cancel, and retry controls.",
      "Native cancellation terminates the Tauri-owned CLI child and records the durable task state so long-running work does not leave an orphan process.",
      "Use Stage Goal for larger tasks; it creates a cached MagAgent master plan and returns the saved `goal-run` preview/run commands in the chat."
    ]
  },
  {
    title: "Configuration",
    icon: Settings2,
    items: [
      "Load guided settings from MagAgent's config schema.",
      "Save common provider, model, memory, and tool values without hand-editing config files.",
      "Use MagAgent 0.32.14+ so provider key aliases, current cloud-model defaults, timing diagnostics, artifact verification, file-write recovery, and current event stream behavior are available to the desktop cockpit.",
      "Use Advanced Dot Path only when you need to set a config value not shown in guided controls."
    ]
  },
  {
    title: "Memory",
    icon: Brain,
    items: [
      "Use the Memory Browser top-down: search memories, select a node, inspect provenance, then preview edits before applying.",
      "Recall reasons, backlinks, and score evidence explain why hybrid retrieval selected a memory.",
      "Reviewed Batch previews and atomically applies several update, suppress, unsuppress, or merge operations.",
      "Memory inbox, suppress/unsuppress, merge, raw JSON, and preview output live in focused drawers so the main editor stays readable.",
      "Use Improve in Chat to ask MagAgent to rewrite or clarify selected memory before applying changes."
    ]
  },
  {
    title: "SQLite",
    icon: Database,
    items: [
      "Use the SQLite Browser top-down: find databases, load tables, click a table to draft a SELECT, then run paged results.",
      "Saved queries, table details, and export previews live in drawers so the query/result path remains clear.",
      "The export drawer prepares JSON or CSV text from the visible query result."
    ]
  },
  {
    title: "Plugins",
    icon: Plug,
    items: [
      "Load installed plugins, select a plugin, and review capability, permission, trust, and contribution metadata.",
      "Install or import plugin sources only after reviewing the safety panel.",
      "Enable and disable installed packs through the same MagAgent plugin commands used by the CLI."
    ]
  },
  {
    title: "Packaging",
    icon: BookOpen,
    items: [
      "GitHub Actions builds Linux, macOS Apple Silicon, macOS Intel, and Windows artifacts on platform-native runners after frontend and Rust tests pass.",
      "Tag builds matching v* draft a GitHub release and attach generated installers.",
      "The Tauri icon set includes PNG, ICNS, and ICO assets for cross-platform bundling.",
      "Unsigned macOS and Windows artifacts are expected until signing and notarization credentials are configured.",
      "In-app updater support should wait for signed updater artifacts and a stable HTTPS or GitHub-release-backed update endpoint."
    ]
  }
];

const screenshots = [
  { title: "Projects", src: "/docs/screenshots/02-projects-light.png" },
  { title: "Agent Chat", src: "/docs/screenshots/03-agent-chat-light.png" },
  { title: "Memory", src: "/docs/screenshots/04-memory-light.png" },
  { title: "Docs Dark Mode", src: "/docs/screenshots/07-docs-dark.png" }
];

export function DocsPanel() {
  return (
    <section className="content-grid">
      <div className="panel hero-panel">
        <div>
          <p className="label">In-App Documentation</p>
          <h3>Operate Mag Command Center without leaving the cockpit.</h3>
          <p>These notes mirror the repository docs and focus on the workflows available in the current desktop build.</p>
        </div>
        <div className="stack">
          <strong>Source of truth</strong>
          <p>The desktop app shells out to the installed MagAgent CLI, so terminal and app workflows share the same config, memory, plugins, and project state.</p>
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
              <img alt={`${screenshot.title} screenshot`} src={screenshot.src} />
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
