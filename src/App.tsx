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
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  TerminalSquare
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { parseJson, runMagent, type MagentCommandResult } from "./magent";

type Theme = "light" | "dark";
type View = "dashboard" | "chat" | "config" | "memory" | "sqlite" | "plugins";

type Readiness = {
  ok?: boolean;
  provider?: string;
  model?: string;
  project?: string;
  checks?: Array<{ key: string; ok: boolean; detail?: string }>;
};

type SystemInfo = {
  magent_version?: string;
  current_user?: string;
  paths?: Record<string, string>;
};

type ChatMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
};

type MemoryNode = {
  id?: string;
  title?: string;
  type?: string;
  path?: string;
  body?: string;
  tags?: string[];
  backlinks?: unknown[];
  [key: string]: unknown;
};

type SqliteDatabase = {
  key?: string;
  name?: string;
  path?: string;
  label?: string;
  [key: string]: unknown;
};

const navItems: Array<{ id: View; label: string; icon: typeof Gauge }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "chat", label: "Agent Chat", icon: MessageSquareText },
  { id: "config", label: "Config", icon: Settings2 },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "sqlite", label: "SQLite", icon: Database },
  { id: "plugins", label: "Plugins", icon: Plug }
];

const defaultProject = "/home/alexmerced/development/personal/Personal/utility/2026/MagAgent";
const storageKeys = {
  theme: "mcc.theme",
  project: "mcc.project",
  projects: "mcc.recentProjects",
  chat: "mcc.chatHistory"
};

function readStoredString(key: string, fallback: string) {
  return localStorage.getItem(key) ?? fallback;
}

function readStoredJson<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function pretty(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function summarizeChatResponse(value: Record<string, unknown> | null) {
  if (!value) return "";
  const candidate = value.response ?? value.answer ?? value.output ?? value.message ?? value.summary;
  return typeof candidate === "string" ? candidate : pretty(value);
}

export function App() {
  const [theme, setTheme] = useState<Theme>(() => readStoredString(storageKeys.theme, "light") as Theme);
  const [view, setView] = useState<View>("dashboard");
  const [project, setProject] = useState(() => readStoredString(storageKeys.project, defaultProject));
  const [recentProjects, setRecentProjects] = useState<string[]>(() =>
    readStoredJson<string[]>(storageKeys.projects, [defaultProject])
  );
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [lastCommand, setLastCommand] = useState<MagentCommandResult | null>(null);
  const [chatPrompt, setChatPrompt] = useState("Summarize this project and suggest the next useful task.");
  const [chatResponse, setChatResponse] = useState<Record<string, unknown> | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() =>
    readStoredJson<ChatMessage[]>(`${storageKeys.chat}:${readStoredString(storageKeys.project, defaultProject)}`, [])
  );
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configPath, setConfigPath] = useState("providers.default");
  const [configValue, setConfigValue] = useState("");
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryGraph, setMemoryGraph] = useState<Record<string, unknown> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
  const [sqliteDbs, setSqliteDbs] = useState<SqliteDatabase[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [sqliteTables, setSqliteTables] = useState<Record<string, unknown> | null>(null);
  const [sqliteQuery, setSqliteQuery] = useState("select name from sqlite_master where type = 'table' order by name;");
  const [sqliteResult, setSqliteResult] = useState<Record<string, unknown> | null>(null);
  const [plugins, setPlugins] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem(storageKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(storageKeys.project, project);
    setChatHistory(readStoredJson<ChatMessage[]>(`${storageKeys.chat}:${project}`, []));
  }, [project]);

  useEffect(() => {
    localStorage.setItem(storageKeys.projects, JSON.stringify(recentProjects));
  }, [recentProjects]);

  useEffect(() => {
    localStorage.setItem(`${storageKeys.chat}:${project}`, JSON.stringify(chatHistory.slice(-80)));
  }, [chatHistory, project]);

  const shellTitle = useMemo(() => navItems.find((item) => item.id === view)?.label ?? "Dashboard", [view]);
  const memoryNodes = useMemo(() => extractNodes(memoryGraph), [memoryGraph]);

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

  function rememberProject(path = project) {
    const trimmed = path.trim();
    if (!trimmed) return;
    setProject(trimmed);
    setRecentProjects((current) => [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 8));
  }

  async function loadSystem() {
    await executeJson<SystemInfo>(["system", "info"], setSystem);
  }

  async function runReadiness() {
    rememberProject();
    await executeJson<Readiness>(["readiness", "--project", project], setReadiness);
  }

  async function runAsk() {
    rememberProject();
    const prompt = chatPrompt.trim();
    if (!prompt) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString()
    };
    setChatHistory((current) => [...current, userMessage]);
    setBusy(true);
    try {
      const result = await runMagent(["ask", "--json", "--project", project, "--repair-attempts", "1", prompt]);
      setLastCommand(result);
      const data = parseJson<Record<string, unknown>>(result);
      setChatResponse(data);
      const agentMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        content: summarizeChatResponse(data) || result.stderr || result.stdout || "No response body returned.",
        createdAt: new Date().toISOString()
      };
      setChatHistory((current) => [...current, agentMessage]);
    } finally {
      setBusy(false);
    }
  }

  async function loadConfig() {
    await executeJson<Record<string, unknown>>(["config", "get"], setConfig);
  }

  async function saveConfigValue() {
    await executeJson<Record<string, unknown>>(["config", "set", configPath, configValue], setConfig);
  }

  async function loadMemoryGraph() {
    const args = ["memory", "graph", "--limit", "80"];
    if (memoryQuery.trim()) args.push("--query", memoryQuery.trim());
    await executeJson<Record<string, unknown>>(args, (data) => {
      setMemoryGraph(data);
      setSelectedNode(null);
    });
  }

  async function loadMemoryNode(id = selectedNodeId) {
    if (!id.trim()) return;
    await executeJson<MemoryNode>(["memory", "node", id.trim()], setSelectedNode);
  }

  async function loadSqliteDbs() {
    await executeJson<Record<string, unknown>>(["data", "sqlite-list"], (data) => {
      const dbs = extractDatabases(data);
      setSqliteDbs(dbs);
      setSelectedDb((current) => current || databaseValue(dbs[0]) || "");
    });
  }

  async function loadSqliteTables() {
    if (!selectedDb) return;
    await executeJson<Record<string, unknown>>(["data", "sqlite-tables", selectedDb], setSqliteTables);
  }

  async function runSqliteQuery() {
    if (!selectedDb || !sqliteQuery.trim()) return;
    await executeJson<Record<string, unknown>>(["data", "sqlite-query", selectedDb, sqliteQuery.trim()], setSqliteResult);
  }

  async function loadPlugins() {
    await executeJson<Record<string, unknown>>(["plugin", "list"], setPlugins);
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
          <button className="icon-action wide" onClick={() => rememberProject()} type="button" title="Save project">
            <FolderOpen size={18} />
            <span>Use Path</span>
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
            recentProjects={recentProjects}
            rememberProject={rememberProject}
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
            history={chatHistory}
            onRun={runAsk}
            onClear={() => {
              setChatHistory([]);
              setChatResponse(null);
            }}
          />
        )}

        {view === "config" && (
          <ConfigPanel
            busy={busy}
            config={config}
            configPath={configPath}
            configValue={configValue}
            setConfigPath={setConfigPath}
            setConfigValue={setConfigValue}
            onLoad={loadConfig}
            onSave={saveConfigValue}
          />
        )}
        {view === "memory" && (
          <MemoryPanel
            busy={busy}
            query={memoryQuery}
            setQuery={setMemoryQuery}
            nodes={memoryNodes}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            selectedNode={selectedNode}
            onLoad={loadMemoryGraph}
            onLoadNode={loadMemoryNode}
          />
        )}
        {view === "sqlite" && (
          <SQLitePanel
            busy={busy}
            databases={sqliteDbs}
            selectedDb={selectedDb}
            setSelectedDb={setSelectedDb}
            tables={sqliteTables}
            query={sqliteQuery}
            setQuery={setSqliteQuery}
            result={sqliteResult}
            onLoadDbs={loadSqliteDbs}
            onLoadTables={loadSqliteTables}
            onRunQuery={runSqliteQuery}
          />
        )}
        {view === "plugins" && <PluginsPanel busy={busy} plugins={plugins} onLoad={loadPlugins} />}
      </main>
    </div>
  );
}

function Dashboard(props: {
  busy: boolean;
  project: string;
  setProject: (project: string) => void;
  recentProjects: string[];
  rememberProject: (project?: string) => void;
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
            Open a folder, inspect readiness, chat through the CLI, and browse memory or databases without
            hand-editing config files.
          </p>
        </div>
        <div className="project-input">
          <label htmlFor="project">Project path</label>
          <input id="project" value={props.project} onChange={(event) => props.setProject(event.target.value)} />
          <button className="icon-action" onClick={() => props.rememberProject()} type="button">
            <Save size={17} />
            <span>Save Project</span>
          </button>
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
        detail={
          props.readiness?.provider
            ? `${props.readiness.provider} / ${props.readiness.model ?? "model"}`
            : "Run readiness"
        }
        action="Run"
        onAction={props.onReadiness}
      />
      <StatusCard
        title="Project"
        icon={Activity}
        status={props.project ? "Selected" : "Missing"}
        detail={props.project}
        action="Remember"
        onAction={() => props.rememberProject()}
      />

      <div className="panel">
        <div className="panel-heading">
          <h3>Recent Projects</h3>
          <FolderOpen size={20} />
        </div>
        <div className="stack">
          {props.recentProjects.map((item) => (
            <button className="list-button" key={item} onClick={() => props.rememberProject(item)} type="button">
              {item}
            </button>
          ))}
        </div>
      </div>

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
            <p className="muted">Run readiness to populate setup, provider, memory, and project checks.</p>
          )}
        </div>
      </div>

      <CommandPanel busy={props.busy} command={props.lastCommand} />
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
  history: ChatMessage[];
  onRun: () => void;
  onClear: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel chat-panel">
        <div className="panel-heading">
          <h3>Project Chat</h3>
          <Sparkles size={20} />
        </div>
        <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} />
        <div className="row-actions">
          <button className="primary-action" onClick={props.onRun} disabled={props.busy} type="button">
            <MessageSquareText size={18} />
            <span>{props.busy ? "Running" : "Run Ask"}</span>
          </button>
          <button className="icon-action" onClick={props.onClear} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Clear</span>
          </button>
        </div>
        <Transcript messages={props.history} />
      </div>
      <div className="panel command-panel">
        <div className="panel-heading">
          <h3>Response JSON</h3>
          <Search size={20} />
        </div>
        <pre>{props.response ? JSON.stringify(props.response, null, 2) : "Run a project ask to see JSON output."}</pre>
      </div>
    </section>
  );
}

function Transcript(props: { messages: ChatMessage[] }) {
  return (
    <div className="transcript">
      {props.messages.length ? (
        props.messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <p className="label">{message.role}</p>
            <p>{message.content}</p>
          </article>
        ))
      ) : (
        <p className="muted">Chat history for this project will appear here.</p>
      )}
    </div>
  );
}

function ConfigPanel(props: {
  busy: boolean;
  config: Record<string, unknown> | null;
  configPath: string;
  configValue: string;
  setConfigPath: (value: string) => void;
  setConfigValue: (value: string) => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-heading">
          <h3>Config Editor</h3>
          <Settings2 size={20} />
        </div>
        <div className="stack">
          <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Load Config</span>
          </button>
          <label htmlFor="config-path">Dot path</label>
          <input id="config-path" value={props.configPath} onChange={(event) => props.setConfigPath(event.target.value)} />
          <label htmlFor="config-value">JSON or string value</label>
          <input
            id="config-value"
            value={props.configValue}
            onChange={(event) => props.setConfigValue(event.target.value)}
            placeholder='"openai" or true'
          />
          <button className="primary-action" onClick={props.onSave} disabled={props.busy} type="button">
            <Save size={18} />
            <span>Save Value</span>
          </button>
        </div>
      </div>
      <JsonPanel title="Redacted Config" icon={<ShieldCheck size={20} />} value={props.config} empty="Load config to inspect redacted settings." />
    </section>
  );
}

function MemoryPanel(props: {
  busy: boolean;
  query: string;
  setQuery: (value: string) => void;
  nodes: MemoryNode[];
  selectedNodeId: string;
  setSelectedNodeId: (value: string) => void;
  selectedNode: MemoryNode | null;
  onLoad: () => void;
  onLoadNode: (id?: string) => void;
}) {
  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-heading">
          <h3>Memory Graph</h3>
          <Brain size={20} />
        </div>
        <div className="stack">
          <label htmlFor="memory-query">Search</label>
          <input id="memory-query" value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
          <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
            <Search size={16} />
            <span>Load Graph</span>
          </button>
          <div className="node-list">
            {props.nodes.length ? (
              props.nodes.map((node) => {
                const id = String(node.id ?? node.path ?? "");
                return (
                  <button
                    className="list-button"
                    key={id}
                    onClick={() => {
                      props.setSelectedNodeId(id);
                      props.onLoadNode(id);
                    }}
                    type="button"
                  >
                    <strong>{node.title ?? node.id ?? "Memory node"}</strong>
                    <span>{node.type ?? node.path ?? id}</span>
                  </button>
                );
              })
            ) : (
              <p className="muted">Load memory to browse graph nodes.</p>
            )}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h3>Node Detail</h3>
          <Search size={20} />
        </div>
        <div className="stack">
          <label htmlFor="node-id">Node ID</label>
          <input id="node-id" value={props.selectedNodeId} onChange={(event) => props.setSelectedNodeId(event.target.value)} />
          <button className="icon-action" onClick={() => props.onLoadNode()} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Inspect</span>
          </button>
          <pre>{props.selectedNode ? JSON.stringify(props.selectedNode, null, 2) : "Select or enter a node ID."}</pre>
        </div>
      </div>
    </section>
  );
}

function SQLitePanel(props: {
  busy: boolean;
  databases: SqliteDatabase[];
  selectedDb: string;
  setSelectedDb: (value: string) => void;
  tables: Record<string, unknown> | null;
  query: string;
  setQuery: (value: string) => void;
  result: Record<string, unknown> | null;
  onLoadDbs: () => void;
  onLoadTables: () => void;
  onRunQuery: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-heading">
          <h3>SQLite Explorer</h3>
          <Database size={20} />
        </div>
        <div className="stack">
          <button className="icon-action" onClick={props.onLoadDbs} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>List DBs</span>
          </button>
          <label htmlFor="sqlite-db">Database</label>
          <select id="sqlite-db" value={props.selectedDb} onChange={(event) => props.setSelectedDb(event.target.value)}>
            <option value="">Select database</option>
            {props.databases.map((db) => {
              const value = databaseValue(db);
              return (
                <option key={value} value={value}>
                  {db.label ?? db.name ?? db.key ?? value}
                </option>
              );
            })}
          </select>
          <button className="icon-action" onClick={props.onLoadTables} disabled={props.busy || !props.selectedDb} type="button">
            <Search size={16} />
            <span>Load Tables</span>
          </button>
          <textarea value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
          <button className="primary-action" onClick={props.onRunQuery} disabled={props.busy || !props.selectedDb} type="button">
            <Database size={18} />
            <span>Run Read-only Query</span>
          </button>
        </div>
      </div>
      <div className="stack">
        <JsonPanel title="Tables" icon={<CheckCircle2 size={20} />} value={props.tables} empty="Load tables for the selected database." />
        <JsonPanel title="Query Result" icon={<Search size={20} />} value={props.result} empty="Run a SELECT or WITH query." />
      </div>
    </section>
  );
}

function PluginsPanel(props: { busy: boolean; plugins: Record<string, unknown> | null; onLoad: () => void }) {
  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-heading">
          <h3>Skills + Plugins</h3>
          <Plug size={20} />
        </div>
        <p>
          Inspect installed packs now. Enable, disable, import, and marketplace workflows can build on this panel once
          those flows are exposed as structured desktop commands.
        </p>
        <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
          <RefreshCcw size={16} />
          <span>Load Plugins</span>
        </button>
      </div>
      <JsonPanel title="Installed Packs" icon={<Plug size={20} />} value={props.plugins} empty="Load plugins to inspect installed packs." />
    </section>
  );
}

function JsonPanel(props: { title: string; icon: ReactNode; value: unknown; empty: string }) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>{props.title}</h3>
        {props.icon}
      </div>
      <pre>{props.value ? JSON.stringify(props.value, null, 2) : props.empty}</pre>
    </div>
  );
}

function CommandPanel(props: { busy: boolean; command: MagentCommandResult | null }) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>Last Command</h3>
        {props.busy && <span className="busy-dot" />}
      </div>
      <pre>{props.command ? JSON.stringify(props.command, null, 2) : "No command run yet."}</pre>
    </div>
  );
}

function extractNodes(graph: Record<string, unknown> | null): MemoryNode[] {
  if (!graph) return [];
  const candidates = [graph.nodes, graph.results, graph.items, graph.memories];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as MemoryNode[];
  }
  return [];
}

function extractDatabases(data: Record<string, unknown> | null): SqliteDatabase[] {
  if (!data) return [];
  const candidates = [data.databases, data.items, data.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as SqliteDatabase[];
  }
  return [];
}

function databaseValue(db?: SqliteDatabase) {
  if (!db) return "";
  return String(db.key ?? db.name ?? db.path ?? db.label ?? "");
}
