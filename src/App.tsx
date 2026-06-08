import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  Moon,
  RefreshCcw,
  Save,
  Sun,
  TerminalSquare,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ToastStack } from "./components/common";
import { DocsPanel } from "./components/docs";
import { ChatPanel, ConfigPanel, Dashboard, MemoryPanel, PluginsPanel, ResearchPanel, SQLitePanel, SetupPanel, WorkbenchPanel } from "./components/panels";
import { defaultProject, minimumMagentVersion, navItems, quickPrompts, storageKeys } from "./lib/constants";
import type { ChatMessage, ChatSession, ConfigField, ProjectInspection, Readiness, SetupMethod, SqliteDatabase, SystemInfo, TableData, Theme, Toast, View } from "./lib/types";
import {
  compareVersions,
  databaseValue,
  encodeFieldValue,
  extractDatabases,
  extractNodes,
  extractRows,
  extractTable,
  getNodeBody,
  parseVersion,
  readStoredJson,
  readStoredString,
  stringifyConfigValue,
  summarizeChatResponse
} from "./lib/utils";
import { inspectProject, parseJson, runMagent, runMagentStream, runSetupCommand, type MagentCommandResult } from "./magent";

export function App() {
  const [theme, setTheme] = useState<Theme>(() => readStoredString(storageKeys.theme, "light") as Theme);
  const [view, setView] = useState<View>("setup");
  const [project, setProject] = useState(() => readStoredString(storageKeys.project, defaultProject));
  const [recentProjects, setRecentProjects] = useState<string[]>(() =>
    readStoredJson<string[]>(storageKeys.projects, [defaultProject])
  );
  const [pinnedProjects, setPinnedProjects] = useState<string[]>(() => readStoredJson<string[]>(storageKeys.pinnedProjects, []));
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [projectInspection, setProjectInspection] = useState<ProjectInspection | null>(null);
  const [lastCommand, setLastCommand] = useState<MagentCommandResult | null>(null);
  const [commandHistory, setCommandHistory] = useState<MagentCommandResult[]>(() =>
    readStoredJson<MagentCommandResult[]>(storageKeys.commands, [])
  );
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [setupMethod, setSetupMethod] = useState<SetupMethod>(() => readStoredString(storageKeys.setupMethod, "pipx-install") as SetupMethod);
  const [setupDismissed, setSetupDismissed] = useState(() => readStoredString(storageKeys.setupDismissed, "false") === "true");

  const [chatPrompt, setChatPrompt] = useState(quickPrompts[0]);
  const [chatSession, setChatSession] = useState("default");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() =>
    normalizeSessions(readStoredJson<unknown>(`${storageKeys.chatSessions}:${readStoredString(storageKeys.project, defaultProject)}`, ["default"]))
  );
  const [sessionDraftName, setSessionDraftName] = useState("");
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [chatResponse, setChatResponse] = useState<Record<string, unknown> | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() =>
    readStoredJson<ChatMessage[]>(`${storageKeys.chat}:${readStoredString(storageKeys.project, defaultProject)}:default`, [])
  );
  const [chatEvents, setChatEvents] = useState<Array<Record<string, unknown>>>([]);

  const [researchTopic, setResearchTopic] = useState("Compare local coding agent desktop app UX patterns");
  const [researchQuestion, setResearchQuestion] = useState("memory management and project switching");
  const [researchResult, setResearchResult] = useState<Record<string, unknown> | null>(null);

  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configSchema, setConfigSchema] = useState<ConfigField[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [configPath, setConfigPath] = useState("defaults.provider");
  const [configValue, setConfigValue] = useState("");

  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryGraph, setMemoryGraph] = useState<Record<string, unknown> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedNode, setSelectedNode] = useState<Record<string, unknown> | null>(null);
  const [memoryEditBody, setMemoryEditBody] = useState("");
  const [memoryPreview, setMemoryPreview] = useState<Record<string, unknown> | null>(null);
  const [memoryInbox, setMemoryInbox] = useState<Record<string, unknown> | null>(null);
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [inboxEditBody, setInboxEditBody] = useState("");
  const [memoryImprovePrompt, setMemoryImprovePrompt] = useState("Improve this memory for clarity, remove duplication, and preserve useful provenance.");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [suppressReason, setSuppressReason] = useState("Reviewed from Mag Command Center");

  const [sqliteDbs, setSqliteDbs] = useState<SqliteDatabase[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [sqliteTables, setSqliteTables] = useState<Record<string, unknown> | null>(null);
  const [sqliteQuery, setSqliteQuery] = useState("select name from sqlite_master where type = 'table' order by name;");
  const [sqliteResult, setSqliteResult] = useState<Record<string, unknown> | null>(null);
  const [sqliteExportFormat, setSqliteExportFormat] = useState<"json" | "csv">("json");
  const [sqlitePage, setSqlitePage] = useState(0);
  const [savedQueries, setSavedQueries] = useState<string[]>(() => readStoredJson<string[]>(storageKeys.sqliteSavedQueries, []));

  const [plugins, setPlugins] = useState<Record<string, unknown> | null>(null);
  const [pluginName, setPluginName] = useState("");
  const [pluginSource, setPluginSource] = useState("");
  const [pluginImportKind, setPluginImportKind] = useState("codex-skill");
  const [pluginReview, setPluginReview] = useState<Record<string, unknown> | null>(null);

  const [recipeName, setRecipeName] = useState("docs-audit");
  const [workbenchResult, setWorkbenchResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(storageKeys.project, project);
    const sessions = normalizeSessions(readStoredJson<unknown>(`${storageKeys.chatSessions}:${project}`, ["default"]));
    setChatSessions(sessions);
    setChatSession((current) => (sessions.some((session) => session.id === current) ? current : sessions[0]?.id ?? "default"));
  }, [project]);

  useEffect(() => {
    setChatHistory(readStoredJson<ChatMessage[]>(`${storageKeys.chat}:${project}:${chatSession}`, []));
    localStorage.setItem(`${storageKeys.chatSessions}:${project}`, JSON.stringify(chatSessions));
  }, [project, chatSession, chatSessions]);

  useEffect(() => {
    localStorage.setItem(storageKeys.projects, JSON.stringify(recentProjects));
  }, [recentProjects]);

  useEffect(() => {
    localStorage.setItem(storageKeys.pinnedProjects, JSON.stringify(pinnedProjects));
  }, [pinnedProjects]);

  useEffect(() => {
    localStorage.setItem(`${storageKeys.chat}:${project}:${chatSession}`, JSON.stringify(chatHistory.slice(-80)));
  }, [chatHistory, project, chatSession]);

  useEffect(() => {
    localStorage.setItem(storageKeys.commands, JSON.stringify(commandHistory.slice(0, 80)));
  }, [commandHistory]);

  useEffect(() => {
    localStorage.setItem(storageKeys.sqliteSavedQueries, JSON.stringify(savedQueries.slice(0, 20)));
  }, [savedQueries]);

  useEffect(() => {
    localStorage.setItem(storageKeys.setupMethod, setupMethod);
  }, [setupMethod]);

  useEffect(() => {
    localStorage.setItem(storageKeys.setupDismissed, setupDismissed ? "true" : "false");
  }, [setupDismissed]);

  useEffect(() => {
    void detectMagent();
  }, []);

  useEffect(() => {
    if (system?.magent_version && magentOk && setupDismissed) setView((current) => (current === "setup" ? "dashboard" : current));
  }, [system, setupDismissed]);

  const shellTitle = useMemo(() => navItems.find((item) => item.id === view)?.label ?? "Projects", [view]);
  const memoryNodes = useMemo(() => extractNodes(memoryGraph), [memoryGraph]);
  const sqliteRows = useMemo(() => extractTable(sqliteResult), [sqliteResult]);
  const tableRows = useMemo(() => extractTable(sqliteTables), [sqliteTables]);
  const pluginRows = useMemo(() => extractRows(plugins), [plugins]);
  const magentOk = compareVersions(system?.magent_version, minimumMagentVersion) >= 0;
  const projectHealth = readiness?.ok ? "Ready" : readiness ? "Needs attention" : "Unchecked";
  const allProjects = useMemo(
    () => Array.from(new Set([...pinnedProjects, ...recentProjects])).filter(Boolean),
    [pinnedProjects, recentProjects]
  );

  function notify(text: string, tone: Toast["tone"] = "info") {
    const toast = { id: crypto.randomUUID(), tone, text };
    setToasts((current) => [toast, ...current].slice(0, 4));
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 5000);
  }

  function recordCommand(result: MagentCommandResult) {
    setLastCommand(result);
    setCommandHistory((current) => [result, ...current].slice(0, 80));
    notify(result.ok ? "Command completed" : "Command needs review", result.ok ? "good" : "bad");
  }

  async function executeJson<T>(args: string[], onData: (data: T | null, result: MagentCommandResult) => void) {
    setBusy(true);
    try {
      const result = await runMagent(args);
      recordCommand(result);
      onData(parseJson<T>(result), result);
    } finally {
      setBusy(false);
    }
  }

  async function executeCommand(args: string[], after?: () => void) {
    setBusy(true);
    try {
      const result = await runMagent(args);
      recordCommand(result);
      after?.();
    } finally {
      setBusy(false);
    }
  }

  async function detectMagent() {
    setBusy(true);
    try {
      const setupCheck = await runSetupCommand("magent", ["--version"]);
      recordCommand(setupCheck);
      const version = parseVersion(setupCheck.stdout || setupCheck.stderr);
      if (setupCheck.ok && version) {
        setSystem({ magent_version: version });
      }
      const result = await runMagent(["system", "info"]);
      recordCommand(result);
      const data = parseJson<SystemInfo>(result);
      if (data) setSystem(data);
    } finally {
      setBusy(false);
    }
  }

  async function installMagent() {
    setBusy(true);
    try {
      const command =
        setupMethod === "pipx-install"
          ? { program: "pipx", args: ["install", "mag-agent"] }
          : setupMethod === "pipx-upgrade"
            ? { program: "pipx", args: ["upgrade", "mag-agent"] }
            : { program: "python3", args: ["-m", "pip", "install", "--user", "-U", "mag-agent"] };
      const result = await runSetupCommand(command.program, command.args);
      recordCommand(result);
      await detectMagent();
    } finally {
      setBusy(false);
    }
  }

  function rememberProject(path = project) {
    const trimmed = path.trim();
    if (!trimmed) return;
    setProject(trimmed);
    setRecentProjects((current) => [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 12));
  }

  function togglePinnedProject(path = project) {
    const trimmed = path.trim();
    if (!trimmed) return;
    setPinnedProjects((current) =>
      current.includes(trimmed) ? current.filter((item) => item !== trimmed) : [trimmed, ...current].slice(0, 12)
    );
    rememberProject(trimmed);
  }

  async function chooseProjectFolder() {
    const selected = await open({ directory: true, multiple: false, title: "Open MagAgent Project" });
    if (typeof selected === "string") rememberProject(selected);
  }

  async function choosePluginSource() {
    const selected = await open({ directory: true, multiple: false, title: "Select Plugin Pack" });
    if (typeof selected === "string") setPluginSource(selected);
  }

  async function runReadiness() {
    rememberProject();
    await executeJson<Readiness>(["readiness", "--project", project], (data) => setReadiness(data));
  }

  async function refreshProjectHealth() {
    setBusy(true);
    try {
      const inspection = await inspectProject(project);
      setProjectInspection(inspection);
      notify("Project health inspected", inspection.exists ? "good" : "bad");
    } finally {
      setBusy(false);
    }
  }

  async function runAsk() {
    rememberProject();
    const prompt = chatPrompt.trim();
    if (!prompt) return;
    if (!chatSessions.some((session) => session.id === chatSession)) {
      const now = new Date().toISOString();
      setChatSessions((current) => [{ id: chatSession, name: chatSession, createdAt: now, updatedAt: now }, ...current].slice(0, 12));
    }
    setChatHistory((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: prompt, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), role: "system", content: "MagAgent is running. Structured events will appear when the command returns.", createdAt: new Date().toISOString() }
    ]);
    setStreamLines([]);
    setChatEvents([{ type: "queued", detail: "Starting MagAgent ask", project }]);
    setBusy(true);
    try {
      const result = await runMagentStream(["ask", "--json", "--events", "--project", project, "--repair-attempts", "1", prompt], (event) => {
        setStreamLines((current) => [...current, `${event.stream}: ${event.line}`].slice(-120));
        setChatEvents((current) => [...current, { type: event.stream, detail: event.line }].slice(-80));
      });
      recordCommand(result);
      const data = parseJson<Record<string, unknown>>(result);
      setChatResponse(data);
      setChatEvents(Array.isArray(data?.events) ? (data.events as Array<Record<string, unknown>>) : [{ type: "completed", ok: result.ok }]);
      updateCurrentSessionSummary(summarizeChatResponse(data) || result.stderr || result.stdout || prompt);
      setChatHistory((current) => [
        ...current.filter((message) => message.content !== "MagAgent is running. Structured events will appear when the command returns."),
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: summarizeChatResponse(data) || result.stderr || result.stdout || "No response body returned.",
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setBusy(false);
    }
  }

  function createChatSession() {
    const now = new Date().toISOString();
    const name = sessionDraftName.trim() || `session-${now.slice(0, 19).replace(/[:T]/g, "-")}`;
    const session = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
    setChatSessions((current) => [session, ...current].slice(0, 12));
    setChatSession(session.id);
    setSessionDraftName("");
    setChatHistory([]);
    setChatEvents([]);
    setChatResponse(null);
    setStreamLines([]);
  }

  function renameChatSession() {
    const name = sessionDraftName.trim();
    if (!name) return;
    setChatSessions((current) =>
      current.map((session) => (session.id === chatSession ? { ...session, name, updatedAt: new Date().toISOString() } : session))
    );
    setSessionDraftName("");
  }

  function deleteChatSession() {
    const remaining = chatSessions.filter((session) => session.id !== chatSession);
    const fallback = remaining[0] ?? { id: "default", name: "default", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setChatSessions(remaining.length ? remaining : [fallback]);
    setChatSession(fallback.id);
    localStorage.removeItem(`${storageKeys.chat}:${project}:${chatSession}`);
  }

  function updateCurrentSessionSummary(content: string) {
    const summary = content.trim().slice(0, 140);
    setChatSessions((current) =>
      current.map((session) => (session.id === chatSession ? { ...session, summary, updatedAt: new Date().toISOString() } : session))
    );
  }

  async function runResearch() {
    const args = ["research", researchTopic, "--question", researchQuestion, "--max-sources", "8"];
    await executeJson<Record<string, unknown>>(args, (data) => setResearchResult(data));
  }

  async function loadConfig() {
    await executeJson<Record<string, unknown>>(["config", "get"], (data) => setConfig(data));
    await executeJson<Record<string, unknown>>(["config", "schema"], (data) => {
      const fields = Array.isArray(data?.fields) ? (data.fields as ConfigField[]) : [];
      setConfigSchema(fields);
      setConfigValues(Object.fromEntries(fields.map((field) => [field.path, stringifyConfigValue(field.value)])));
    });
  }

  async function saveConfigValue(path = configPath, value = configValue) {
    await executeJson<Record<string, unknown>>(["config", "set", path, value], (data) => setConfig(data));
    await loadConfig();
  }

  async function loadMemoryGraph() {
    const args = ["memory", "graph", "--limit", "80"];
    if (memoryQuery.trim()) args.push("--query", memoryQuery.trim());
    await executeJson<Record<string, unknown>>(args, (data) => {
      setMemoryGraph(data);
      setSelectedNode(null);
      setMemoryPreview(null);
    });
  }

  async function loadMemoryInbox() {
    await executeJson<Record<string, unknown>>(["memory", "inbox", "--json"], (data) => setMemoryInbox(data));
  }

  async function updateMemoryInbox(action: "accept" | "reject") {
    if (!selectedInboxId.trim()) return;
    await executeCommand(["memory", "inbox", action, selectedInboxId.trim()], loadMemoryInbox);
  }

  async function loadMemoryNode(id = selectedNodeId) {
    if (!id.trim()) return;
    await executeJson<Record<string, unknown>>(["memory", "node", id.trim()], (data) => {
      setSelectedNode(data);
      setMemoryEditBody(getNodeBody(data));
      setMemoryPreview(null);
    });
  }

  async function previewMemoryUpdate() {
    if (!selectedNodeId.trim()) return;
    await executeJson<Record<string, unknown>>(
      ["memory", "update-node", selectedNodeId.trim(), "--preview", "--body", memoryEditBody],
      (data) => setMemoryPreview(data)
    );
  }

  async function applyMemoryUpdate() {
    if (!selectedNodeId.trim()) return;
    await executeJson<Record<string, unknown>>(
      ["memory", "update-node", selectedNodeId.trim(), "--body", memoryEditBody],
      (data) => {
        setMemoryPreview(data);
        void loadMemoryNode(selectedNodeId);
      }
    );
  }

  async function askToImproveMemory() {
    if (!selectedNodeId.trim()) return;
    const prompt = `${memoryImprovePrompt}\n\nNode ID: ${selectedNodeId}\n\nCurrent body:\n${memoryEditBody}`;
    setView("chat");
    setChatPrompt(prompt);
  }

  async function suppressMemoryNode() {
    if (!selectedNodeId.trim()) return;
    await executeCommand(["memory", "suppress", selectedNodeId.trim(), "--reason", suppressReason]);
    await loadMemoryNode(selectedNodeId);
  }

  async function unsuppressMemoryNode() {
    if (!selectedNodeId.trim()) return;
    await executeCommand(["memory", "unsuppress", selectedNodeId.trim()]);
    await loadMemoryNode(selectedNodeId);
  }

  async function mergeMemoryNodes(preview: boolean) {
    if (!mergeTargetId.trim() || !mergeSourceId.trim()) return;
    const args = ["memory", "merge", mergeTargetId.trim(), mergeSourceId.trim()];
    if (preview) args.push("--preview");
    await executeCommand(args, loadMemoryGraph);
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
    await executeJson<Record<string, unknown>>(["data", "sqlite-tables", selectedDb], (data) => setSqliteTables(data));
  }

  async function runSqliteQuery() {
    if (!selectedDb || !sqliteQuery.trim()) return;
    const pagedQuery = withPagination(sqliteQuery.trim(), sqlitePage);
    await executeJson<Record<string, unknown>>(["data", "sqlite-query", selectedDb, pagedQuery], (data) =>
      setSqliteResult(data)
    );
  }

  function saveSqliteQuery() {
    const query = sqliteQuery.trim();
    if (!query) return;
    setSavedQueries((current) => [query, ...current.filter((item) => item !== query)].slice(0, 20));
  }

  async function loadPlugins() {
    await executeJson<Record<string, unknown>>(["plugin", "list", "--json"], (data) => setPlugins(data));
  }

  async function reviewPlugin() {
    if (pluginName.trim()) {
      await executeJson<Record<string, unknown>>(["plugin", "explain", pluginName.trim(), "--json"], (data) => setPluginReview(data));
      return;
    }
    if (!pluginSource.trim()) return;
    const args =
      pluginImportKind === "mcp"
        ? ["plugin", "mcp", "import", pluginSource.trim(), "--dry-run", "--json"]
        : ["plugin", "import", pluginImportKind, pluginSource.trim(), "--dry-run", "--json"];
    await executeJson<Record<string, unknown>>(args, (data) => setPluginReview(data));
  }

  async function updatePlugin(enabled: boolean) {
    if (!pluginName.trim()) return;
    await executeCommand(["plugin", enabled ? "enable" : "disable", pluginName.trim()], loadPlugins);
  }

  async function installPlugin() {
    if (!pluginSource.trim()) return;
    const args = ["plugin", "install", pluginSource.trim()];
    if (pluginName.trim()) args.push("--name", pluginName.trim());
    await executeCommand(args, loadPlugins);
  }

  async function importPlugin() {
    if (!pluginSource.trim()) return;
    const args =
      pluginImportKind === "mcp"
        ? ["plugin", "mcp", "import", pluginSource.trim()]
        : ["plugin", "import", pluginImportKind, pluginSource.trim()];
    if (pluginName.trim()) args.push("--name", pluginName.trim());
    await executeCommand(args, loadPlugins);
  }

  async function runRecipe(name = recipeName) {
    const args = ["recipe", "run", name, "--project", project, "--json"];
    await executeJson<Record<string, unknown>>(args, (data) => setWorkbenchResult(data));
  }

  async function listRecipes() {
    await executeJson<Record<string, unknown>>(["recipe", "list", "--json"], (data) => setWorkbenchResult(data));
  }

  async function inspectPatch() {
    await executeJson<Record<string, unknown>>(["project", "patch", "--project", project, "--json"], (data) => setWorkbenchResult(data));
  }

  const needsSetup = !system?.magent_version || !magentOk;

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
          <button className="icon-action wide" onClick={chooseProjectFolder} type="button" title="Open folder">
            <FolderOpen size={18} />
            <span>Open Folder</span>
          </button>
          <button className="icon-action wide" onClick={() => togglePinnedProject()} type="button" title="Pin project">
            <Save size={18} />
            <span>{pinnedProjects.includes(project) ? "Unpin" : "Pin"} Project</span>
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="label">{needsSetup && !setupDismissed ? "First Run" : "Workspace"}</p>
            <h2>{shellTitle}</h2>
          </div>
          <div className="topbar-actions">
            <button className="icon-action" onClick={detectMagent} type="button" title="Detect MagAgent">
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

        {needsSetup && !setupDismissed && view !== "setup" && (
          <div className="setup-banner">
            <Wand2 size={20} />
            <strong>MagAgent is missing or older than {minimumMagentVersion}.</strong>
            <button className="icon-action" onClick={() => setView("setup")} type="button">
              <Wand2 size={16} />
              <span>Open Setup</span>
            </button>
          </div>
        )}

        {view === "setup" && (
          <SetupPanel
            busy={busy}
            system={system}
            magentOk={magentOk}
            setupMethod={setupMethod}
            setSetupMethod={setSetupMethod}
            setupDismissed={setupDismissed}
            setSetupDismissed={setSetupDismissed}
            onDetect={detectMagent}
            onInstall={installMagent}
            lastCommand={lastCommand}
          />
        )}

        {view === "dashboard" && (
          <Dashboard
            busy={busy}
            project={project}
            setProject={setProject}
            recentProjects={recentProjects}
            pinnedProjects={pinnedProjects}
            allProjects={allProjects}
            projectHealth={projectHealth}
            rememberProject={rememberProject}
            togglePinnedProject={togglePinnedProject}
            chooseProjectFolder={chooseProjectFolder}
            system={system}
            magentOk={magentOk}
            readiness={readiness}
            projectInspection={projectInspection}
            commandHistory={commandHistory}
            lastCommand={lastCommand}
            onSystem={detectMagent}
            onReadiness={runReadiness}
            onInspectProject={refreshProjectHealth}
          />
        )}

        {view === "chat" && (
          <ChatPanel
            busy={busy}
            prompt={chatPrompt}
            setPrompt={setChatPrompt}
            session={chatSession}
            sessions={chatSessions}
            setSession={setChatSession}
            sessionDraftName={sessionDraftName}
            setSessionDraftName={setSessionDraftName}
            onNewSession={createChatSession}
            onRenameSession={renameChatSession}
            onDeleteSession={deleteChatSession}
            streamLines={streamLines}
            response={chatResponse}
            events={chatEvents}
            history={chatHistory}
            quickPrompts={quickPrompts}
            onRun={runAsk}
            onClear={() => {
              setChatHistory([]);
              setChatEvents([]);
              setChatResponse(null);
            }}
          />
        )}

        {view === "research" && (
          <ResearchPanel
            busy={busy}
            topic={researchTopic}
            question={researchQuestion}
            result={researchResult}
            setTopic={setResearchTopic}
            setQuestion={setResearchQuestion}
            onRun={runResearch}
          />
        )}

        {view === "config" && (
          <ConfigPanel
            busy={busy}
            config={config}
            fields={configSchema}
            values={configValues}
            setValues={setConfigValues}
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
            editBody={memoryEditBody}
            setEditBody={setMemoryEditBody}
            preview={memoryPreview}
            inbox={memoryInbox}
            selectedInboxId={selectedInboxId}
            setSelectedInboxId={setSelectedInboxId}
            inboxEditBody={inboxEditBody}
            setInboxEditBody={setInboxEditBody}
            improvePrompt={memoryImprovePrompt}
            setImprovePrompt={setMemoryImprovePrompt}
            mergeTargetId={mergeTargetId}
            mergeSourceId={mergeSourceId}
            suppressReason={suppressReason}
            setMergeTargetId={setMergeTargetId}
            setMergeSourceId={setMergeSourceId}
            setSuppressReason={setSuppressReason}
            onLoad={loadMemoryGraph}
            onLoadNode={loadMemoryNode}
            onPreview={previewMemoryUpdate}
            onApply={applyMemoryUpdate}
            onImprove={askToImproveMemory}
            onLoadInbox={loadMemoryInbox}
            onInboxAction={updateMemoryInbox}
            onSuppress={suppressMemoryNode}
            onUnsuppress={unsuppressMemoryNode}
            onMerge={mergeMemoryNodes}
          />
        )}

        {view === "sqlite" && (
          <SQLitePanel
            busy={busy}
            databases={sqliteDbs}
            selectedDb={selectedDb}
            setSelectedDb={setSelectedDb}
            tables={sqliteTables}
            tableRows={tableRows}
            query={sqliteQuery}
            setQuery={setSqliteQuery}
            page={sqlitePage}
            setPage={setSqlitePage}
            savedQueries={savedQueries}
            onSaveQuery={saveSqliteQuery}
            result={sqliteResult}
            resultRows={sqliteRows}
            exportFormat={sqliteExportFormat}
            setExportFormat={setSqliteExportFormat}
            onLoadDbs={loadSqliteDbs}
            onLoadTables={loadSqliteTables}
            onRunQuery={runSqliteQuery}
          />
        )}

        {view === "plugins" && (
          <PluginsPanel
            busy={busy}
            plugins={plugins}
            pluginRows={pluginRows}
            pluginName={pluginName}
            pluginSource={pluginSource}
            pluginImportKind={pluginImportKind}
            pluginReview={pluginReview}
            setPluginName={setPluginName}
            setPluginSource={setPluginSource}
            setPluginImportKind={setPluginImportKind}
            choosePluginSource={choosePluginSource}
            onLoad={loadPlugins}
            onReview={reviewPlugin}
            onEnable={() => updatePlugin(true)}
            onDisable={() => updatePlugin(false)}
            onInstall={installPlugin}
            onImport={importPlugin}
          />
        )}

        {view === "workbench" && (
          <WorkbenchPanel
            busy={busy}
            project={project}
            recipeName={recipeName}
            setRecipeName={setRecipeName}
            result={workbenchResult}
            commandHistory={commandHistory}
            onListRecipes={listRecipes}
            onRunRecipe={runRecipe}
            onInspectPatch={inspectPatch}
          />
        )}

        {view === "docs" && <DocsPanel />}

        <ToastStack toasts={toasts} />
      </main>
    </div>
  );
}

function withPagination(query: string, page: number) {
  const normalized = query.trim().replace(/;$/, "");
  if (/\blimit\b/i.test(normalized)) return normalized;
  return `${normalized} limit 100 offset ${Math.max(0, page) * 100}`;
}

function normalizeSessions(value: unknown): ChatSession[] {
  const now = new Date().toISOString();
  if (!Array.isArray(value)) return [{ id: "default", name: "default", createdAt: now, updatedAt: now }];
  const sessions = value
    .map((item): ChatSession | null => {
      if (typeof item === "string") return { id: item, name: item, createdAt: now, updatedAt: now };
      if (typeof item === "object" && item !== null) {
        const record = item as Partial<ChatSession>;
        const id = record.id || record.name;
        if (!id) return null;
        return {
          id,
          name: record.name || id,
          createdAt: record.createdAt || now,
          updatedAt: record.updatedAt || record.createdAt || now,
          summary: record.summary
        };
      }
      return null;
    })
    .filter((item): item is ChatSession => Boolean(item));
  return sessions.length ? sessions : [{ id: "default", name: "default", createdAt: now, updatedAt: now }];
}
