import { BookOpen, Brain, Database, MessageSquareText, Plug, Settings2, ShieldCheck, Workflow } from "lucide-react";

const docs = [
  {
    title: "First Run",
    icon: ShieldCheck,
    items: [
      "Open Setup to detect MagAgent and verify the minimum desktop API version.",
      "Use pipx install/upgrade when possible; user-scoped pip is available as a fallback.",
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
      "Chat history is stored per project and per named session in local browser storage.",
      "Create, rename, delete, and switch sessions from the Agent Chat panel.",
      "Chat uses a streaming Tauri bridge for live stdout/stderr and keeps structured MagAgent events when the command returns."
    ]
  },
  {
    title: "Configuration",
    icon: Settings2,
    items: [
      "Load guided settings from MagAgent's config schema.",
      "Save common provider, model, memory, and tool values without hand-editing config files.",
      "Use Advanced Dot Path only when you need to set a config value not shown in guided controls."
    ]
  },
  {
    title: "Memory",
    icon: Brain,
    items: [
      "Browse graph nodes, inspect backlinks/provenance, and preview memory edits before writing.",
      "Use the inbox to review pending candidates and accept or reject them.",
      "Use Improve in Chat to ask MagAgent to rewrite or clarify selected memory before applying changes."
    ]
  },
  {
    title: "SQLite",
    icon: Database,
    items: [
      "List MagAgent SQLite databases, inspect tables, and run read-only query workflows.",
      "Click table names to generate a SELECT query, page through results, and save useful queries.",
      "The export pane prepares JSON or CSV text from the visible query result."
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
      "GitHub Actions builds Linux, macOS, and Windows artifacts on platform-native runners after frontend and Rust tests pass.",
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
