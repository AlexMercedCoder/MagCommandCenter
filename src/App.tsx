import {
  Activity,
  Brain,
  CheckCircle2,
  Database,
  FolderOpen,
  Gauge,
  MessageSquareText,
  Moon,
  Plug,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  TerminalSquare
} from "lucide-react";
import { useMemo, useState } from "react";
import { parseJson, runMagent, type MagentCommandResult } from "./magent";

type Theme = "light" | "dark";
type View = "dashboard" | "chat" | "config" | "memory" | "sqlite" | "plugins";

type Readiness = {
  ok?: boolean;
  provider?: string;
  model?: string;
  project?: string;
  checks?: Array<{ key: string; ok: boolean }>;
};

type SystemInfo = {
  magent_version?: string;
  current_user?: string;
  paths?: Record<string, string>;
};

const navItems: Array<{ id: View; label: string; icon: typeof Gauge }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "chat", label: "Agent Chat", icon: MessageSquareText },
  { id: "config", label: "Config", icon: Settings2 },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "sqlite", label: "SQLite", icon: Database },
  { id: "plugins", label: "Plugins", icon: Plug }
];

const demoProject = "/Users/alex/Projects/my-app";

export function App() {
  const [theme, setTheme] = useState<Theme>("light");
  const [view, setView] = useState<View>("dashboard");
  const [project, setProject] = useState(demoProject);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [lastCommand, setLastCommand] = useState<MagentCommandResult | null>(null);
  const [chatPrompt, setChatPrompt] = useState("Summarize this project and suggest the next useful task.");
  const [chatResponse, setChatResponse] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const shellTitle = useMemo(() => {
    const active = navItems.find((item) => item.id === view);
    return active?.label ?? "Dashboard";
  }, [view]);

  async function executeJson<T>(args: string[], onData: (data: T | null) => void) {
    setBusy(true);
    try {
      const result = await runMagent(args);
      setLastCommand(result);
      onData(parseJson<T>(result));
    } finally {
      setBusy(false);
    }
  }

  async function loadSystem() {
    await executeJson<SystemInfo>(["system", "info"], setSystem);
  }

  async function runReadiness() {
    await executeJson<Readiness>(["readiness", "--project", project], setReadiness);
  }

  async function runAsk() {
    await executeJson<Record<string, unknown>>(
      ["ask", "--json", "--project", project, "--repair-attempts", "1", chatPrompt],
      setChatResponse
    );
  }

  return (
    <div className="app" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">MC</div>
          <div>
            <h1>Mag Command Center</h1>
            <p>Local agent cockpit</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-button active" : "nav-button"}
                onClick={() => setView(item.id)}
                type="button"
                title={item.label}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <p className="label">Active Project</p>
          <strong>{project}</strong>
          <button className="icon-action wide" type="button" title="Open folder">
            <FolderOpen size={18} />
            <span>Open Folder</span>
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="label">Workspace</p>
            <h2>{shellTitle}</h2>
          </div>
          <div className="topbar-actions">
            <button className="icon-action" onClick={loadSystem} type="button" title="Detect MagAgent">
              <TerminalSquare size={18} />
              <span>Detect</span>
            </button>
            <button className="icon-action" onClick={runReadiness} type="button" title="Run readiness">
              <RefreshCcw size={18} />
              <span>Readiness</span>
            </button>
            <button
              className="icon-button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              type="button"
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard
            busy={busy}
            project={project}
            setProject={setProject}
            system={system}
            readiness={readiness}
            lastCommand={lastCommand}
            onSystem={loadSystem}
            onReadiness={runReadiness}
          />
        )}

        {view === "chat" && (
          <ChatPanel
            busy={busy}
            prompt={chatPrompt}
            setPrompt={setChatPrompt}
            response={chatResponse}
            onRun={runAsk}
          />
        )}

        {view === "config" && <ConfigPanel />}
        {view === "memory" && <MemoryPanel />}
        {view === "sqlite" && <SQLitePanel />}
        {view === "plugins" && <PluginsPanel />}
      </main>
    </div>
  );
}

function Dashboard(props: {
  busy: boolean;
  project: string;
  setProject: (project: string) => void;
  system: SystemInfo | null;
  readiness: Readiness | null;
  lastCommand: MagentCommandResult | null;
  onSystem: () => void;
  onReadiness: () => void;
}) {
  const checks = props.readiness?.checks ?? [];
  return (
    <section className="content-grid">
      <div className="panel hero-panel">
        <div>
          <p className="label">Command Surface</p>
          <h3>Project-aware control for MagAgent</h3>
          <p>
            Open a folder, inspect readiness, chat through the CLI, and browse memory or databases
            without hand-editing config files.
          </p>
        </div>
        <div className="project-input">
          <label htmlFor="project">Project path</label>
          <input id="project" value={props.project} onChange={(event) => props.setProject(event.target.value)} />
        </div>
      </div>

      <StatusCard
        title="MagAgent"
        icon={TerminalSquare}
        status={props.system?.magent_version ? `v${props.system.magent_version}` : "Not checked"}
        detail={props.system?.current_user ? `User ${props.system.current_user}` : "Run detect"}
        action="Detect"
        onAction={props.onSystem}
      />
      <StatusCard
        title="Readiness"
        icon={ShieldCheck}
        status={props.readiness ? (props.readiness.ok ? "Ready" : "Needs attention") : "Not checked"}
        detail={props.readiness?.provider ? `${props.readiness.provider} / ${props.readiness.model ?? "model"}` : "Run readiness"}
        action="Run"
        onAction={props.onReadiness}
      />
      <StatusCard
        title="Model Health"
        icon={Activity}
        status="Pending"
        detail="Use model health in MagAgent 0.29+"
        action="Refresh"
        onAction={props.onReadiness}
      />

      <div className="panel">
        <div className="panel-heading">
          <h3>Readiness Checks</h3>
          <CheckCircle2 size={20} />
        </div>
        <div className="check-list">
          {checks.length ? (
            checks.map((check) => (
              <div className="check-row" key={check.key}>
                <span>{check.key}</span>
                <strong>{check.ok ? "OK" : "Review"}</strong>
              </div>
            ))
          ) : (
            <p className="muted">Run readiness to populate setup, docs, provider, and project checks.</p>
          )}
        </div>
      </div>

      <div className="panel command-panel">
        <div className="panel-heading">
          <h3>Last Command</h3>
          {props.busy && <span className="busy-dot" />}
        </div>
        <pre>{props.lastCommand ? JSON.stringify(props.lastCommand, null, 2) : "No command run yet."}</pre>
      </div>
    </section>
  );
}

function StatusCard(props: {
  title: string;
  icon: typeof Gauge;
  status: string;
  detail: string;
  action: string;
  onAction: () => void;
}) {
  const Icon = props.icon;
  return (
    <div className="panel status-card">
      <div className="status-icon">
        <Icon size={22} />
      </div>
      <div>
        <p className="label">{props.title}</p>
        <h3>{props.status}</h3>
        <p>{props.detail}</p>
      </div>
      <button className="icon-action" onClick={props.onAction} type="button" title={props.action}>
        <RefreshCcw size={16} />
        <span>{props.action}</span>
      </button>
    </div>
  );
}

function ChatPanel(props: {
  busy: boolean;
  prompt: string;
  setPrompt: (value: string) => void;
  response: Record<string, unknown> | null;
  onRun: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel chat-panel">
        <div className="panel-heading">
          <h3>Project Chat</h3>
          <Sparkles size={20} />
        </div>
        <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} />
        <button className="primary-action" onClick={props.onRun} disabled={props.busy} type="button">
          <MessageSquareText size={18} />
          <span>{props.busy ? "Running" : "Run Ask"}</span>
        </button>
      </div>
      <div className="panel command-panel">
        <div className="panel-heading">
          <h3>Response + Audit</h3>
          <Search size={20} />
        </div>
        <pre>{props.response ? JSON.stringify(props.response, null, 2) : "Run a project ask to see JSON output."}</pre>
      </div>
    </section>
  );
}

function ConfigPanel() {
  return <Placeholder icon={Settings2} title="Config Workbench" text="Provider, model role, permission, memory, and subagent controls will use MagAgent config get/set APIs." />;
}

function MemoryPanel() {
  return <Placeholder icon={Brain} title="Memory Workbench" text="Browse MagGraph nodes, backlinks, provenance, and launch memory improvement prompts." />;
}

function SQLitePanel() {
  return <Placeholder icon={Database} title="SQLite Explorer" text="List MagAgent databases, inspect tables and schemas, and run read-only queries." />;
}

function PluginsPanel() {
  return <Placeholder icon={Plug} title="Skills + Plugins" text="Manage installed skills, plugins, contributed agents, recipes, hooks, and MCP configs." />;
}

function Placeholder(props: { icon: typeof Gauge; title: string; text: string }) {
  const Icon = props.icon;
  return (
    <section className="panel placeholder-panel">
      <Icon size={42} />
      <h3>{props.title}</h3>
      <p>{props.text}</p>
    </section>
  );
}
