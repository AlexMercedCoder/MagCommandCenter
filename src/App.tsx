import { open } from "@tauri-apps/plugin-dialog";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ToastStack } from "./components/common";
import {
  AppRail,
  CommandPalette,
  ContextSidebar,
  LibraryLanding,
  WorkspaceHeader,
} from "./components/app-shell";
import {
  ChatPanel,
  ConfigPanel,
  Dashboard,
  MemoryPanel,
  PluginsPanel,
  ResearchPanel,
  SQLitePanel,
  SetupPanel,
  WorkbenchPanel,
} from "./components/panels";
import {
  activeExecutionStates,
  defaultProject,
  minimumMagentVersion,
  navItems,
  quickPrompts,
  storageKeys,
} from "./lib/constants";
import { useExecutionRuntime } from "./hooks/use-execution-runtime";
import { useWorkbenchRuntime } from "./hooks/use-workbench-runtime";
import { useSchedules } from "./hooks/use-schedules";
import { useProfileRuntime } from "./features/profiles/use-profile-runtime";
import { loadAppState, saveAppState } from "./lib/persistence";
import {
  newChatMessage,
  normalizeSessions,
  summarizeOrchestratedGoal,
  withPagination,
} from "./lib/workspace";
import {
  measurePerformance,
  performanceReport,
  recordPerformance,
} from "./lib/performance";
import type {
  Accent,
  ArtifactPreview,
  CacheReadiness,
  ChatMessage,
  ChatSession,
  ConfigField,
  EcosystemReadiness,
  ProjectCrew,
  ProjectInspection,
  ProviderDetection,
  Readiness,
  SetupMethod,
  SqliteDatabase,
  SystemInfo,
  TableData,
  Theme,
  Toast,
  ToolReadiness,
  View,
  WorkspaceFile,
} from "./lib/types";
import {
  compareVersions,
  databaseValue,
  deriveRunCockpit,
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
  summarizeChatResponse,
} from "./lib/utils";
import {
  inspectProject,
  magentClient,
  parseJson,
  readProjectArtifact,
  runMagent,
  runMagentStream,
  runSetupCommand,
  saveDiagnosticsBundle,
  type MagentCommandResult,
} from "./magent";
import { workspaceClient } from "./lib/workspace-client";
import {
  defaultShortcuts,
  normalizeShortcut,
  shortcutConflicts,
  shortcutFromEvent,
  type ShortcutMap,
} from "./lib/keybindings";
import { ShortcutEditor } from "./components/shortcut-editor";
import { RuntimeTransportPanel } from "./components/runtime-transport-panel";
import { KeepAwakePanel } from "./components/keep-awake-panel";
import { AppearancePanel } from "./components/appearance-panel";

const WorkspacePanel = lazy(() =>
  import("./components/workspace-panel").then((module) => ({
    default: module.WorkspacePanel,
  })),
);
const ToolsPanel = lazy(() =>
  import("./components/tools-panel").then((module) => ({
    default: module.ToolsPanel,
  })),
);
const AgentsPanel = lazy(() =>
  import("./components/agents-panel").then((module) => ({
    default: module.AgentsPanel,
  })),
);
const GraphBoardPanel = lazy(() =>
  import("./components/graph-board-panel").then((module) => ({
    default: module.GraphBoardPanel,
  })),
);
const RunCenterPanel = lazy(() =>
  import("./components/run-center-panel").then((module) => ({
    default: module.RunCenterPanel,
  })),
);
const DocsPanel = lazy(() =>
  import("./components/docs").then((module) => ({ default: module.DocsPanel })),
);

export function App() {
  const startupStartedAt = useRef(performance.now());
  const [theme, setTheme] = useState<Theme>(
    () => readStoredString(storageKeys.theme, "light") as Theme,
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  const [accent, setAccent] = useState<Accent>(
    () => readStoredString(storageKeys.accent, "yellow") as Accent,
  );
  const [view, setView] = useState<View>("setup");
  const [railCollapsed, setRailCollapsed] = useState(
    () => readStoredString("mcc.railCollapsed", "false") === "true",
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() =>
    readStoredJson("mcc.shortcuts.v1", defaultShortcuts),
  );
  const [graphDirty, setGraphDirty] = useState(false);
  const [project, setProject] = useState(() =>
    readStoredString(storageKeys.project, defaultProject),
  );
  const [recentProjects, setRecentProjects] = useState<string[]>(() =>
    readStoredJson<string[]>(storageKeys.projects, [defaultProject]),
  );
  const [pinnedProjects, setPinnedProjects] = useState<string[]>(() =>
    readStoredJson<string[]>(storageKeys.pinnedProjects, []),
  );
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [ecosystemReadiness, setEcosystemReadiness] =
    useState<EcosystemReadiness | null>(null);
  const [toolReadiness, setToolReadiness] = useState<ToolReadiness | null>(
    null,
  );
  const [providerDetection, setProviderDetection] =
    useState<ProviderDetection | null>(null);
  const [cacheReadiness, setCacheReadiness] = useState<CacheReadiness | null>(
    null,
  );
  const [projectInspection, setProjectInspection] =
    useState<ProjectInspection | null>(null);
  const [lastCommand, setLastCommand] = useState<MagentCommandResult | null>(
    null,
  );
  const [commandHistory, setCommandHistory] = useState<MagentCommandResult[]>(
    () => readStoredJson<MagentCommandResult[]>(storageKeys.commands, []),
  );
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [setupMethod, setSetupMethod] = useState<SetupMethod>(
    () =>
      readStoredString(storageKeys.setupMethod, "pipx-install") as SetupMethod,
  );
  const [setupDismissed, setSetupDismissed] = useState(
    () => readStoredString(storageKeys.setupDismissed, "false") === "true",
  );

  const [chatPrompt, setChatPrompt] = useState(quickPrompts[0]);
  const [chatSession, setChatSession] = useState("default");
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() =>
    normalizeSessions(
      readStoredJson<unknown>(
        `${storageKeys.chatSessions}:${readStoredString(storageKeys.project, defaultProject)}`,
        ["default"],
      ),
    ),
  );
  const [sessionDraftName, setSessionDraftName] = useState("");
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [chatResponse, setChatResponse] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() =>
    readStoredJson<ChatMessage[]>(
      `${storageKeys.chat}:${readStoredString(storageKeys.project, defaultProject)}:default`,
      [],
    ),
  );
  const [chatEvents, setChatEvents] = useState<Array<Record<string, unknown>>>(
    [],
  );

  const [researchTopic, setResearchTopic] = useState(
    "Compare local coding agent desktop app UX patterns",
  );
  const [researchQuestion, setResearchQuestion] = useState(
    "memory management and project switching",
  );
  const [researchResult, setResearchResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configSchema, setConfigSchema] = useState<ConfigField[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [configPath, setConfigPath] = useState("defaults.provider");
  const [configValue, setConfigValue] = useState("");

  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryGraph, setMemoryGraph] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedNode, setSelectedNode] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [memoryEditBody, setMemoryEditBody] = useState("");
  const [memoryPreview, setMemoryPreview] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [memoryInbox, setMemoryInbox] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [inboxEditBody, setInboxEditBody] = useState("");
  const [memoryImprovePrompt, setMemoryImprovePrompt] = useState(
    "Improve this memory for clarity, remove duplication, and preserve useful provenance.",
  );
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [suppressReason, setSuppressReason] = useState(
    "Reviewed from Mag Command Center",
  );
  const [memoryBatchText, setMemoryBatchText] = useState(
    '[\n  { "action": "suppress", "node_id": "" }\n]',
  );

  const [sqliteDbs, setSqliteDbs] = useState<SqliteDatabase[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [sqliteTables, setSqliteTables] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [sqliteQuery, setSqliteQuery] = useState(
    "select name from sqlite_master where type = 'table' order by name;",
  );
  const [sqliteResult, setSqliteResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [sqliteExportFormat, setSqliteExportFormat] = useState<"json" | "csv">(
    "json",
  );
  const [sqlitePage, setSqlitePage] = useState(0);
  const [savedQueries, setSavedQueries] = useState<string[]>(() =>
    readStoredJson<string[]>(storageKeys.sqliteSavedQueries, []),
  );

  const [plugins, setPlugins] = useState<Record<string, unknown> | null>(null);
  const [pluginName, setPluginName] = useState("");
  const [pluginSource, setPluginSource] = useState("");
  const [pluginImportKind, setPluginImportKind] = useState("codex-skill");
  const [pluginReview, setPluginReview] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [recipeName, setRecipeName] = useState("docs-audit");
  const [graphPath, setGraphPath] = useState("");
  const [graphActivity, setGraphActivity] = useState<string[]>([]);
  const [workbenchResult, setWorkbenchResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const execution = useExecutionRuntime(project);
  const workbench = useWorkbenchRuntime(project, {
    setBusy,
    notify,
    onResult: setWorkbenchResult,
  });
  const profiles = useProfileRuntime(project, Boolean(system?.magent_version));
  const schedules = useSchedules(runScheduledGraph);
  const [projectCrews, setProjectCrews] = useState<Record<string, ProjectCrew>>(
    () => readStoredJson(storageKeys.projectCrews, {}),
  );
  const workspaceRef = useRef({ project, session: chatSession });
  const [artifactPreview, setArtifactPreview] =
    useState<ArtifactPreview | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceFile[]>([]);
  const [persistenceReady, setPersistenceReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const initialProject = await loadAppState(storageKeys.project, project);
      setTheme(await loadAppState(storageKeys.theme, theme));
      setAccent(await loadAppState(storageKeys.accent, accent));
      setProject(initialProject);
      setRecentProjects(
        await loadAppState(storageKeys.projects, recentProjects),
      );
      setPinnedProjects(
        await loadAppState(storageKeys.pinnedProjects, pinnedProjects),
      );
      setCommandHistory(
        await loadAppState(storageKeys.commands, commandHistory),
      );
      setSavedQueries(
        await loadAppState(storageKeys.sqliteSavedQueries, savedQueries),
      );
      setSetupMethod(await loadAppState(storageKeys.setupMethod, setupMethod));
      setSetupDismissed(
        await loadAppState(storageKeys.setupDismissed, setupDismissed),
      );
      setProjectCrews(
        await loadAppState(storageKeys.projectCrews, projectCrews),
      );
      setPersistenceReady(true);
      recordPerformance("desktop.startup", startupStartedAt.current);
    })();
  }, []);

  useEffect(() => {
    if (persistenceReady) void saveAppState(storageKeys.theme, theme);
  }, [theme, persistenceReady]);

  useEffect(() => {
    if (persistenceReady) void saveAppState(storageKeys.accent, accent);
  }, [accent, persistenceReady]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const update = () => setSystemDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!persistenceReady) return;
    void saveAppState(storageKeys.project, project);
    void loadAppState<unknown>(
      `${storageKeys.chatSessions}:${project}`,
      readStoredJson<unknown>(`${storageKeys.chatSessions}:${project}`, [
        "default",
      ]),
    ).then((stored) => {
      const sessions = normalizeSessions(stored);
      setChatSessions(sessions);
      setChatSession((current) =>
        sessions.some((session) => session.id === current)
          ? current
          : (sessions[0]?.id ?? "default"),
      );
    });
  }, [project, persistenceReady]);

  useEffect(() => {
    setWorkspaceContext([]);
  }, [project, chatSession]);

  useEffect(() => {
    if (!persistenceReady) return;
    void loadAppState(
      `${storageKeys.chat}:${project}:${chatSession}`,
      readStoredJson<ChatMessage[]>(
        `${storageKeys.chat}:${project}:${chatSession}`,
        [],
      ),
    ).then(setChatHistory);
    void saveAppState(`${storageKeys.chatSessions}:${project}`, chatSessions);
  }, [project, chatSession, chatSessions, persistenceReady]);

  useEffect(() => {
    if (persistenceReady)
      void saveAppState(storageKeys.projects, recentProjects);
  }, [recentProjects, persistenceReady]);

  useEffect(() => {
    if (persistenceReady)
      void saveAppState(storageKeys.pinnedProjects, pinnedProjects);
  }, [pinnedProjects, persistenceReady]);

  useEffect(() => {
    if (persistenceReady)
      void saveAppState(
        `${storageKeys.chat}:${project}:${chatSession}`,
        chatHistory.slice(-1000),
      );
  }, [chatHistory, project, chatSession, persistenceReady]);

  useEffect(() => {
    if (persistenceReady)
      void saveAppState(storageKeys.commands, commandHistory.slice(0, 500));
  }, [commandHistory, persistenceReady]);

  useEffect(() => {
    if (persistenceReady)
      void saveAppState(
        storageKeys.sqliteSavedQueries,
        savedQueries.slice(0, 100),
      );
  }, [savedQueries, persistenceReady]);

  useEffect(() => {
    if (persistenceReady)
      void saveAppState(storageKeys.setupMethod, setupMethod);
  }, [setupMethod, persistenceReady]);

  useEffect(() => {
    if (persistenceReady)
      void saveAppState(storageKeys.setupDismissed, setupDismissed);
  }, [setupDismissed, persistenceReady]);

  useEffect(() => {
    if (persistenceReady)
      void saveAppState(storageKeys.projectCrews, projectCrews);
  }, [projectCrews, persistenceReady]);

  useEffect(() => {
    workspaceRef.current = { project, session: chatSession };
  }, [project, chatSession]);

  useEffect(() => {
    localStorage.setItem("mcc.railCollapsed", String(railCollapsed));
  }, [railCollapsed]);

  useEffect(() => {
    localStorage.setItem("mcc.shortcuts.v1", JSON.stringify(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const pressed = shortcutFromEvent(event);
      const editable =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable);
      if (pressed === normalizeShortcut(shortcuts.palette)) {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        return;
      }
      if (!editable && shortcutConflicts(shortcuts).length === 0) {
        const action = (
          Object.entries(shortcuts) as Array<[keyof ShortcutMap, string]>
        ).find(([, value]) => normalizeShortcut(value) === pressed)?.[0];
        if (action) event.preventDefault();
        if (action === "newSession") createChatSession();
        if (action === "workspace") navigate("workspace");
        if (action === "runs") navigate("runs");
        if (action === "graphs") navigate("graphs");
        if (action === "tools") navigate("tools");
        if (action === "help") navigate("docs");
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [shortcuts]);

  useEffect(() => {
    void detectMagent();
  }, []);

  useEffect(() => {
    if (system?.magent_version && magentOk && setupDismissed)
      setView((current) => (current === "setup" ? "chat" : current));
  }, [system, setupDismissed]);

  const shellTitle = useMemo(
    () => navItems.find((item) => item.id === view)?.label ?? "Projects",
    [view],
  );
  const memoryNodes = useMemo(() => extractNodes(memoryGraph), [memoryGraph]);
  const sqliteRows = useMemo(() => extractTable(sqliteResult), [sqliteResult]);
  const tableRows = useMemo(() => extractTable(sqliteTables), [sqliteTables]);
  const pluginRows = useMemo(() => extractRows(plugins), [plugins]);
  const runtimeEvents = useMemo(
    () =>
      execution.events.map((event) => ({
        type: event.type,
        state: event.state,
        ...event.detail,
      })),
    [execution.events],
  );
  const chatCockpit = useMemo(
    () =>
      deriveRunCockpit(
        [...chatEvents, ...runtimeEvents],
        chatResponse,
        streamLines,
      ),
    [chatEvents, runtimeEvents, chatResponse, streamLines],
  );
  const contractsOk =
    system?.contracts?.desktop_cli?.version === "1" &&
    system?.contracts?.task?.version === "magent.task.v2" &&
    system?.contracts?.task_event?.version === "magent.task-event.v1" &&
    system?.contracts?.memory_recall?.version === "2";
  const magentOk =
    compareVersions(system?.magent_version, minimumMagentVersion) >= 0 &&
    contractsOk;
  const projectHealth = readiness?.ok
    ? "Ready"
    : readiness
      ? "Needs attention"
      : "Unchecked";
  const allProjects = useMemo(
    () =>
      Array.from(new Set([...pinnedProjects, ...recentProjects])).filter(
        Boolean,
      ),
    [pinnedProjects, recentProjects],
  );
  const projectCrew = projectCrews[project] ?? {
    project,
    coordinator: "",
    members: [],
  };
  const activeChatSession = chatSessions.find(
    (session) => session.id === chatSession,
  );
  const activeProfile =
    activeChatSession?.agentProfile ||
    projectCrew.coordinator ||
    profiles.defaultProfile ||
    "magagent";
  const activeProfileSummary = profiles.profiles.find(
    (item) => item.name === activeProfile,
  );
  const profileDrifted = Boolean(
    activeChatSession?.profileDigest &&
    activeProfileSummary?.profile_digest &&
    activeChatSession.profileDigest !== activeProfileSummary.profile_digest,
  );

  function notify(text: string, tone: Toast["tone"] = "info") {
    const toast = { id: crypto.randomUUID(), tone, text };
    setToasts((current) => [toast, ...current].slice(0, 4));
    window.setTimeout(
      () =>
        setToasts((current) => current.filter((item) => item.id !== toast.id)),
      5000,
    );
  }

  function navigate(next: View) {
    if (
      view === "graphs" &&
      next !== "graphs" &&
      graphDirty &&
      !window.confirm(
        "Leave Graph Board? Your unsaved draft is recoverable, but it has not been written to the graph file.",
      )
    )
      return;
    setView(next);
    setMobileNavOpen(false);
  }

  function recordCommand(result: MagentCommandResult, announce = true) {
    setLastCommand(result);
    setCommandHistory((current) => [result, ...current].slice(0, 80));
    if (announce)
      notify(
        result.ok ? "Command completed" : "Command needs review",
        result.ok ? "good" : "bad",
      );
  }

  async function executeJson<T>(
    args: string[],
    onData: (data: T | null, result: MagentCommandResult) => void,
  ) {
    setBusy(true);
    try {
      const result = await runMagent(args);
      recordCommand(result);
      onData(parseJson<T>(result), result);
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "MagAgent command failed to start",
        "bad",
      );
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
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "MagAgent command failed to start",
        "bad",
      );
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
      const contractResult = await runMagent(["system", "contracts"]);
      recordCommand(contractResult);
      const contracts = parseJson<{
        schema?: string;
        contracts?: SystemInfo["contracts"];
      }>(contractResult);
      if (contracts?.contracts) {
        setSystem((current) => ({
          ...current,
          contract_schema: contracts.schema,
          contracts: contracts.contracts,
        }));
      }
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
            : {
                program: "python3",
                args: ["-m", "pip", "install", "--user", "-U", "mag-agent"],
              };
      const result = await runSetupCommand(command.program, command.args);
      recordCommand(result);
      await detectMagent();
    } finally {
      setBusy(false);
    }
  }

  function rememberProject(path = project) {
    const startedAt = performance.now();
    const trimmed = path.trim();
    if (!trimmed) return;
    setProject(trimmed);
    setRecentProjects((current) =>
      [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 12),
    );
    window.requestAnimationFrame(() =>
      recordPerformance("project.switch", startedAt),
    );
  }

  function togglePinnedProject(path = project) {
    const trimmed = path.trim();
    if (!trimmed) return;
    setPinnedProjects((current) =>
      current.includes(trimmed)
        ? current.filter((item) => item !== trimmed)
        : [trimmed, ...current].slice(0, 12),
    );
    rememberProject(trimmed);
  }

  async function chooseProjectFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open MagAgent Project",
    });
    if (typeof selected === "string") rememberProject(selected);
  }

  async function choosePluginSource() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Plugin Pack",
    });
    if (typeof selected === "string") setPluginSource(selected);
  }

  async function runReadiness() {
    rememberProject();
    await executeJson<Readiness>(["readiness", "--project", project], (data) =>
      setReadiness(data),
    );
  }

  async function runEcosystemReadiness() {
    await executeJson<EcosystemReadiness>(
      ["system", "ecosystem-report", "--root", project],
      (data) => setEcosystemReadiness(data),
    );
  }

  async function runEnvironmentDiagnostics() {
    setBusy(true);
    try {
      const [tools, providers, cache] = await Promise.all([
        runMagent(["tools", "doctor"]),
        runMagent(["provider", "detect"]),
        runMagent(["cache", "doctor", "--json"]),
      ]);
      setToolReadiness(parseJson<ToolReadiness>(tools));
      setProviderDetection(parseJson<ProviderDetection>(providers));
      setCacheReadiness(parseJson<CacheReadiness>(cache));
      [tools, providers, cache].forEach((result) =>
        recordCommand(result, false),
      );
      const ok = tools.ok && providers.ok && cache.ok;
      notify(
        ok
          ? "Environment diagnostics are ready"
          : "Some environment checks need review",
        ok ? "good" : "bad",
      );
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Environment diagnostics failed to start",
        "bad",
      );
    } finally {
      setBusy(false);
    }
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
    const rawPrompt = chatPrompt.trim();
    let prompt = rawPrompt;
    if (workspaceContext.length) {
      try {
        const context = await workspaceClient.context(
          project,
          workspaceContext.map((item) => item.path),
        );
        prompt += context.prompt;
      } catch (reason) {
        notify(
          reason instanceof Error
            ? reason.message
            : "Could not attach workspace context",
          "bad",
        );
        return;
      }
    }
    if (!prompt) return;
    if (
      activeChatSession?.kind === "group" &&
      (activeChatSession.participants?.length ?? 0) >= 2
    ) {
      await runGroupAsk(rawPrompt, prompt, activeChatSession);
      return;
    }
    const origin = { project, session: chatSession };
    if (!chatSessions.some((session) => session.id === chatSession)) {
      const now = new Date().toISOString();
      setChatSessions((current) =>
        [
          {
            id: chatSession,
            name: chatSession,
            createdAt: now,
            updatedAt: now,
            agentProfile: activeProfile,
            profileDigest: activeProfileSummary?.profile_digest,
          },
          ...current,
        ].slice(0, 12),
      );
    }
    setChatHistory((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: rawPrompt,
        createdAt: new Date().toISOString(),
      },
    ]);
    setStreamLines([]);
    setChatEvents([
      { type: "queued", detail: "Starting MagAgent ask", project },
    ]);
    setChatBusy(true);
    try {
      const task = await execution.createTask(prompt, chatSession);
      const streamId = crypto.randomUUID();
      execution.registerStream(task.id, streamId);
      const askArgs = [
        "ask",
        "--json",
        "--events",
        "--project",
        project,
        "--agent",
        activeProfile,
        "--execution-task-id",
        task.id,
        "--repair-attempts",
        "1",
      ];
      if (activeChatSession?.permissionMode)
        askArgs.push("--permission-mode", activeChatSession.permissionMode);
      askArgs.push(prompt);
      const result = await runMagentStream(
        askArgs,
        (event) => {
          if (
            workspaceRef.current.project === origin.project &&
            workspaceRef.current.session === origin.session
          ) {
            setStreamLines((current) =>
              [...current, `${event.stream}: ${event.line}`].slice(-120),
            );
            setChatEvents((current) =>
              [...current, { type: event.stream, detail: event.line }].slice(
                -80,
              ),
            );
          }
        },
        { id: streamId },
      );
      recordCommand(result);
      const data = parseJson<Record<string, unknown>>(result);
      const summary =
        summarizeChatResponse(data) ||
        result.stderr ||
        result.stdout ||
        "No response body returned.";
      if (
        workspaceRef.current.project === origin.project &&
        workspaceRef.current.session === origin.session
      ) {
        setChatResponse(data);
      }
      const finalEvents = Array.isArray(data?.events)
        ? (data.events as Array<Record<string, unknown>>)
        : [];
      if (
        workspaceRef.current.project === origin.project &&
        workspaceRef.current.session === origin.session
      ) {
        setChatEvents((current) =>
          [
            ...current,
            ...finalEvents,
            { type: "completed", ok: result.ok, status: result.status },
          ].slice(-160),
        );
        updateCurrentSessionSummary(summary || prompt);
        setChatHistory((current) => [
          ...current,
          newChatMessage("agent", summary),
        ]);
      } else {
        const key = `${storageKeys.chat}:${origin.project}:${origin.session}`;
        const stored = await loadAppState<ChatMessage[]>(key, []);
        await saveAppState(
          key,
          [...stored, newChatMessage("agent", summary)].slice(-1000),
        );
      }
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "MagAgent did not return a response.";
      if (
        workspaceRef.current.project === origin.project &&
        workspaceRef.current.session === origin.session
      ) {
        setChatEvents((current) =>
          [...current, { type: "failed", detail: message }].slice(-160),
        );
        setChatHistory((current) => [
          ...current,
          newChatMessage("system", `Run failed: ${message}`),
        ]);
      }
      notify(message, "bad");
    } finally {
      setChatBusy(false);
      void execution.refreshTasks();
    }
  }

  async function runGroupAsk(
    rawPrompt: string,
    prompt: string,
    session: ChatSession,
  ) {
    const participants = (session.participants || []).slice(0, 5);
    const mode = session.groupMode || "sequential";
    const coordinator = session.coordinator || participants[0];
    setChatHistory((current) => [
      ...current,
      newChatMessage("user", rawPrompt),
    ]);
    setChatBusy(true);
    setChatEvents([{ type: "group.started", mode, participants }]);
    const ask = async (profile: string, input: string) => {
      const task = await execution.createTask(
        `[${profile}] ${rawPrompt}`,
        `${chatSession}:${profile}`,
      );
      const args = [
        "ask",
        "--json",
        "--events",
        "--project",
        project,
        "--agent",
        profile,
        "--execution-task-id",
        task.id,
        "--repair-attempts",
        "1",
      ];
      if (session.permissionMode)
        args.push("--permission-mode", session.permissionMode);
      args.push(input);
      const result = await runMagent(args);
      const data = parseJson<Record<string, unknown>>(result);
      const summary =
        summarizeChatResponse(data) ||
        result.stderr ||
        result.stdout ||
        "No response returned.";
      setChatEvents((current) =>
        [
          ...current,
          { type: "group.participant.completed", profile, ok: result.ok },
        ].slice(-160),
      );
      setChatHistory((current) => [
        ...current,
        {
          ...newChatMessage(result.ok ? "agent" : "system", summary),
          speaker: profile,
        },
      ]);
      return { profile, summary, ok: result.ok };
    };
    try {
      let findings: Array<{ profile: string; summary: string; ok: boolean }> =
        [];
      if (mode === "sequential") {
        let handoff = prompt;
        for (const profile of participants) {
          const result = await ask(
            profile,
            `${handoff}\n\nYou are ${profile}. Build on prior attributed findings when present.`,
          );
          findings.push(result);
          handoff += `\n\n## ${profile}\n${result.summary}`;
        }
      } else {
        const specialists =
          mode === "coordinator"
            ? participants.filter((item) => item !== coordinator)
            : participants;
        findings = await Promise.all(
          specialists.map((profile) => ask(profile, prompt)),
        );
        if (mode === "coordinator") {
          const evidence = findings
            .map((item) => `## ${item.profile}\n${item.summary}`)
            .join("\n\n");
          findings.push(
            await ask(
              coordinator,
              `${prompt}\n\nSynthesize these attributed specialist findings. Preserve disagreements and evidence.\n\n${evidence}`,
            ),
          );
        }
      }
      updateCurrentSessionSummary(
        findings[findings.length - 1]?.summary || rawPrompt,
      );
      notify(
        `Group run completed with ${findings.length} attributed responses.`,
        findings.every((item) => item.ok) ? "good" : "bad",
      );
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Group run failed",
        "bad",
      );
    } finally {
      setChatBusy(false);
      void execution.refreshTasks();
    }
  }

  async function createOrchestratedGoal() {
    rememberProject();
    const prompt = chatPrompt.trim();
    if (!prompt) return;
    setChatHistory((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: `Stage goal: ${prompt}`,
        createdAt: new Date().toISOString(),
      },
    ]);
    setStreamLines([]);
    setChatEvents([
      {
        type: "queued",
        detail: "Creating orchestrated MagAgent goal",
        project,
      },
    ]);
    setChatBusy(true);
    try {
      const result = await runMagent([
        "goal",
        prompt,
        "--project",
        project,
        "--agent",
        activeProfile,
        "--orchestrated",
        "--json",
      ]);
      recordCommand(result);
      const data = parseJson<Record<string, unknown>>(result);
      setChatResponse(data);
      setChatEvents((current) =>
        [
          ...current,
          { type: "completed", ok: result.ok, status: result.status },
        ].slice(-160),
      );
      const summary =
        summarizeOrchestratedGoal(data) ||
        result.stderr ||
        result.stdout ||
        "No staged plan details returned.";
      updateCurrentSessionSummary(summary);
      setChatHistory((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: summary,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function previewArtifact(path: string) {
    try {
      setArtifactPreview(await readProjectArtifact(project, path));
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Could not preview artifact",
        "bad",
      );
    }
  }

  async function exportDiagnostics() {
    setBusy(true);
    try {
      const path = await saveDiagnosticsBundle(project, performanceReport());
      notify(`Redacted diagnostics saved to ${path}`, "good");
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Could not save diagnostics",
        "bad",
      );
    } finally {
      setBusy(false);
    }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      notify("Desktop notifications are unavailable in this build.", "bad");
      return;
    }
    const permission = await Notification.requestPermission();
    notify(
      permission === "granted"
        ? "Task notifications enabled"
        : "Task notifications were not enabled",
      permission === "granted" ? "good" : "info",
    );
  }

  function createChatSession() {
    const now = new Date().toISOString();
    const name =
      sessionDraftName.trim() ||
      `session-${now.slice(0, 19).replace(/[:T]/g, "-")}`;
    const initialProfile = projectCrew.coordinator || profiles.defaultProfile;
    const session = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      agentProfile: initialProfile,
      profileDigest: profiles.profiles.find(
        (item) => item.name === initialProfile,
      )?.profile_digest,
      kind: "chat" as const,
    };
    setChatSessions((current) => [session, ...current].slice(0, 12));
    setChatSession(session.id);
    setSessionDraftName("");
    setChatHistory([]);
    setChatEvents([]);
    setChatResponse(null);
    setStreamLines([]);
  }

  function forkChatSession() {
    const active = chatSessions.find((item) => item.id === chatSession);
    if (!active) return;
    const now = new Date().toISOString();
    const fork = {
      ...active,
      id: crypto.randomUUID(),
      name: `${active.name} · fork`,
      parentSessionId: active.id,
      createdAt: now,
      updatedAt: now,
    };
    void saveAppState(`${storageKeys.chat}:${project}:${fork.id}`, chatHistory);
    setChatSessions((current) => [fork, ...current].slice(0, 40));
    setChatSession(fork.id);
    notify("Session forked with the current transcript.", "good");
  }

  function compactChatSession() {
    if (chatHistory.length < 6) {
      notify("This session is already compact.");
      return;
    }
    const retained = chatHistory.slice(-6);
    const older = chatHistory.slice(0, -6);
    const summary = older
      .map((item) => `${item.speaker || item.role}: ${item.content}`)
      .join("\n")
      .slice(0, 12_000);
    setChatHistory([
      {
        ...newChatMessage(
          "system",
          `Compacted session context (${older.length} messages):\n${summary}`,
        ),
      },
      ...retained,
    ]);
    setChatSessions((current) =>
      current.map((item) =>
        item.id === chatSession
          ? { ...item, compactedAt: new Date().toISOString() }
          : item,
      ),
    );
    notify("Older context compacted into a bounded summary.", "good");
  }

  function exportChatSession() {
    const active = chatSessions.find((item) => item.id === chatSession);
    const body = [
      `# ${active?.name || "MagAgent session"}`,
      "",
      ...chatHistory.map(
        (item) => `## ${item.speaker || item.role}\n\n${item.content}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([body], { type: "text/markdown" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(active?.name || "session").replace(/[^A-Za-z0-9_.-]/g, "-")}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function configureGroup(
    participants: string[],
    mode: "sequential" | "parallel" | "coordinator",
    coordinator: string,
  ) {
    const bounded = participants.slice(0, 5);
    setChatSessions((current) =>
      current.map((item) =>
        item.id === chatSession
          ? {
              ...item,
              kind: bounded.length >= 2 ? "group" : "chat",
              participants: bounded,
              groupMode: mode,
              coordinator: bounded.includes(coordinator)
                ? coordinator
                : bounded[0],
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
  }

  function setSessionPermissionMode(
    mode: "paranoid" | "balanced" | "silent" | "yolo",
  ) {
    if (
      mode === "yolo" &&
      !window.confirm(
        "Full access can allow consequential tools without per-action prompts. The profile and managed policy still apply. Continue for this session?",
      )
    )
      return;
    setChatSessions((current) =>
      current.map((item) =>
        item.id === chatSession
          ? {
              ...item,
              permissionMode: mode,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
  }

  function renameChatSession() {
    const name = sessionDraftName.trim();
    if (!name) return;
    setChatSessions((current) =>
      current.map((session) =>
        session.id === chatSession
          ? { ...session, name, updatedAt: new Date().toISOString() }
          : session,
      ),
    );
    setSessionDraftName("");
  }

  function deleteChatSession() {
    const remaining = chatSessions.filter(
      (session) => session.id !== chatSession,
    );
    const fallback = remaining[0] ?? {
      id: "default",
      name: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setChatSessions(remaining.length ? remaining : [fallback]);
    setChatSession(fallback.id);
    void saveAppState(`${storageKeys.chat}:${project}:${chatSession}`, []);
  }

  function updateCurrentSessionSummary(content: string) {
    const summary = content.trim().slice(0, 140);
    setChatSessions((current) =>
      current.map((session) =>
        session.id === chatSession
          ? { ...session, summary, updatedAt: new Date().toISOString() }
          : session,
      ),
    );
  }

  function selectSessionProfile(name: string) {
    const digest = profiles.profiles.find(
      (item) => item.name === name,
    )?.profile_digest;
    setChatSessions((current) =>
      current.map((session) =>
        session.id === chatSession
          ? {
              ...session,
              agentProfile: name,
              profileDigest: digest,
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    );
  }

  function openProfileInChat(name: string) {
    selectSessionProfile(name);
    setView("chat");
  }

  function updateProjectCrew(crew: ProjectCrew) {
    setProjectCrews((current) => ({ ...current, [project]: crew }));
  }

  async function runResearch() {
    const args = [
      "research",
      researchTopic,
      "--question",
      researchQuestion,
      "--max-sources",
      "8",
      "--project",
      project,
      "--agent",
      activeProfile,
    ];
    await executeJson<Record<string, unknown>>(args, (data) =>
      setResearchResult(data),
    );
  }

  async function loadConfig() {
    await executeJson<Record<string, unknown>>(["config", "get"], (data) =>
      setConfig(data),
    );
    await executeJson<Record<string, unknown>>(["config", "schema"], (data) => {
      const fields = Array.isArray(data?.fields)
        ? (data.fields as ConfigField[])
        : [];
      setConfigSchema(fields);
      setConfigValues(
        Object.fromEntries(
          fields.map((field) => [
            field.path,
            stringifyConfigValue(field.value),
          ]),
        ),
      );
    });
  }

  async function saveConfigValue(path = configPath, value = configValue) {
    await executeJson<Record<string, unknown>>(
      ["config", "set", path, value],
      (data) => setConfig(data),
    );
    await loadConfig();
  }

  async function loadMemoryGraph() {
    const args = ["memory", "graph", "--limit", "80"];
    if (memoryQuery.trim()) args.push("--query", memoryQuery.trim());
    await measurePerformance("memory.search", () =>
      executeJson<Record<string, unknown>>(args, (data) => {
        setMemoryGraph(data);
        setSelectedNode(null);
        setMemoryPreview(null);
      }),
    );
  }

  async function loadMemoryInbox() {
    await executeJson<Record<string, unknown>>(
      ["memory", "inbox", "--json"],
      (data) => setMemoryInbox(data),
    );
  }

  async function updateMemoryInbox(action: "accept" | "reject") {
    if (!selectedInboxId.trim()) return;
    await executeCommand(
      ["memory", "inbox", action, selectedInboxId.trim()],
      loadMemoryInbox,
    );
  }

  async function loadMemoryNode(id = selectedNodeId) {
    if (!id.trim()) return;
    await executeJson<Record<string, unknown>>(
      ["memory", "node", id.trim()],
      (data) => {
        setSelectedNode(data);
        setMemoryEditBody(getNodeBody(data));
        setMemoryPreview(null);
      },
    );
  }

  async function previewMemoryUpdate() {
    if (!selectedNodeId.trim()) return;
    await executeJson<Record<string, unknown>>(
      [
        "memory",
        "update-node",
        selectedNodeId.trim(),
        "--preview",
        "--body",
        memoryEditBody,
      ],
      (data) => setMemoryPreview(data),
    );
  }

  async function applyMemoryUpdate() {
    if (!selectedNodeId.trim()) return;
    await executeJson<Record<string, unknown>>(
      [
        "memory",
        "update-node",
        selectedNodeId.trim(),
        "--body",
        memoryEditBody,
      ],
      (data) => {
        setMemoryPreview(data);
        void loadMemoryNode(selectedNodeId);
      },
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
    await executeCommand([
      "memory",
      "suppress",
      selectedNodeId.trim(),
      "--reason",
      suppressReason,
    ]);
    await loadMemoryNode(selectedNodeId);
  }

  async function unsuppressMemoryNode() {
    if (!selectedNodeId.trim()) return;
    await executeCommand(["memory", "unsuppress", selectedNodeId.trim()]);
    await loadMemoryNode(selectedNodeId);
  }

  async function mergeMemoryNodes(preview: boolean) {
    if (!mergeTargetId.trim() || !mergeSourceId.trim()) return;
    const args = [
      "memory",
      "merge",
      mergeTargetId.trim(),
      mergeSourceId.trim(),
    ];
    if (preview) args.push("--preview");
    await executeCommand(args, loadMemoryGraph);
  }

  async function applyMemoryBatch(preview: boolean) {
    let operations: unknown;
    try {
      operations = JSON.parse(memoryBatchText);
      if (!Array.isArray(operations))
        throw new Error("Batch must be a JSON array.");
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Invalid batch JSON",
        "bad",
      );
      return;
    }
    const args = [
      "memory",
      "batch",
      "--operations-json",
      JSON.stringify(operations),
    ];
    if (preview) args.push("--preview");
    await executeJson<Record<string, unknown>>(args, (data) => {
      setMemoryPreview(data);
      if (!preview) void loadMemoryGraph();
    });
  }

  async function loadSqliteDbs() {
    await executeJson<Record<string, unknown>>(
      ["data", "sqlite-list"],
      (data) => {
        const dbs = extractDatabases(data);
        setSqliteDbs(dbs);
        setSelectedDb((current) => current || databaseValue(dbs[0]) || "");
      },
    );
  }

  async function loadSqliteTables() {
    if (!selectedDb) return;
    await executeJson<Record<string, unknown>>(
      ["data", "sqlite-tables", selectedDb],
      (data) => setSqliteTables(data),
    );
  }

  async function runSqliteQuery() {
    if (!selectedDb || !sqliteQuery.trim()) return;
    const pagedQuery = withPagination(sqliteQuery.trim(), sqlitePage);
    await measurePerformance("sqlite.query", () =>
      executeJson<Record<string, unknown>>(
        ["data", "sqlite-query", selectedDb, pagedQuery],
        (data) => setSqliteResult(data),
      ),
    );
  }

  function saveSqliteQuery() {
    const query = sqliteQuery.trim();
    if (!query) return;
    setSavedQueries((current) =>
      [query, ...current.filter((item) => item !== query)].slice(0, 20),
    );
  }

  async function loadPlugins() {
    await executeJson<Record<string, unknown>>(
      ["plugin", "list", "--json"],
      (data) => setPlugins(data),
    );
  }

  async function reviewPlugin() {
    if (pluginName.trim()) {
      await executeJson<Record<string, unknown>>(
        ["plugin", "explain", pluginName.trim(), "--json"],
        (data) => setPluginReview(data),
      );
      return;
    }
    if (!pluginSource.trim()) return;
    const args =
      pluginImportKind === "mcp"
        ? [
            "plugin",
            "mcp",
            "import",
            pluginSource.trim(),
            "--dry-run",
            "--json",
          ]
        : [
            "plugin",
            "import",
            pluginImportKind,
            pluginSource.trim(),
            "--dry-run",
            "--json",
          ];
    await executeJson<Record<string, unknown>>(args, (data) =>
      setPluginReview(data),
    );
  }

  async function updatePlugin(enabled: boolean) {
    if (!pluginName.trim()) return;
    await executeCommand(
      ["plugin", enabled ? "enable" : "disable", pluginName.trim()],
      loadPlugins,
    );
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
    const args = [
      "recipe",
      "run",
      name,
      "--project",
      project,
      "--agent",
      activeProfile,
      "--json",
    ];
    await executeJson<Record<string, unknown>>(args, (data) =>
      setWorkbenchResult(data),
    );
  }

  async function listRecipes() {
    await executeJson<Record<string, unknown>>(
      ["recipe", "list", "--project", project, "--json"],
      (data) => setWorkbenchResult(data),
    );
  }

  async function inspectPatch() {
    await executeJson<Record<string, unknown>>(
      ["project", "patch", "--project", project, "--json"],
      (data) => setWorkbenchResult(data),
    );
  }

  async function chooseGraphFile() {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Open Agentic Graph",
      filters: [{ name: "Agentic Graph", extensions: ["yaml", "yml", "json"] }],
    });
    if (typeof selected === "string") setGraphPath(selected);
  }

  async function inspectGraph(action: "validate" | "plan") {
    if (!graphPath.trim()) return;
    const args = ["graph", action, graphPath.trim(), "--json"];
    if (action === "validate") args.splice(3, 0, "--strict");
    await executeJson<Record<string, unknown>>(args, (data) =>
      setWorkbenchResult(data),
    );
  }

  async function runGraph() {
    if (!graphPath.trim()) return;
    const approved = window.confirm(
      "Run this reviewed graph and approve all of its declared human gates and checkpoints? Validate and review the plan first.",
    );
    if (!approved) return;
    setBusy(true);
    setGraphActivity([]);
    try {
      const result = await runMagentStream(
        [
          "graph",
          "run",
          graphPath.trim(),
          "--project",
          project,
          "--agent",
          activeProfile,
          "--yes",
          "--json",
        ],
        (event) =>
          setGraphActivity((current) => [...current.slice(-199), event.line]),
      );
      recordCommand(result);
      setWorkbenchResult(parseJson<Record<string, unknown>>(result));
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Graph execution failed to start",
        "bad",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runScheduledGraph(
    schedule: import("./lib/types").GraphSchedule,
  ) {
    const result = await runMagentStream(
      [
        "graph",
        "run",
        schedule.path,
        "--project",
        schedule.project,
        "--agent",
        activeProfile,
        "--json",
      ],
      () => undefined,
    );
    recordCommand(result, false);
    await execution.refreshTasks();
    if (!result.ok) throw new Error(result.stderr || "Scheduled graph failed");
  }

  async function createSchedule(path: string, intervalMinutes: number) {
    setBusy(true);
    try {
      const validation = await magentClient.validateGraph(path);
      const plan = await magentClient.planGraph(path);
      const gates = Array.isArray(plan.gates) ? plan.gates : [];
      if (validation.ok === false)
        throw new Error(
          "Graph validation failed; fix findings before scheduling.",
        );
      schedules.add({
        project,
        path,
        intervalMinutes: Math.max(1, Math.min(10080, intervalMinutes)),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        enabled: true,
        requiresApproval: gates.length > 0,
      });
      notify(
        gates.length
          ? "Schedule created. Each due run will wait for gate approval."
          : "Schedule created.",
        "good",
      );
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Could not schedule graph",
        "bad",
      );
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  function scheduleAction(
    id: string,
    action: "pause" | "resume" | "run" | "approve" | "delete",
  ) {
    const schedule = schedules.schedules.find((item) => item.id === id);
    if (!schedule) return;
    if (action === "delete") {
      if (window.confirm(`Delete schedule for ${schedule.path}?`))
        schedules.remove(id);
    } else if (action === "pause" || action === "resume") {
      schedules.update(id, { enabled: action === "resume" });
    } else {
      void schedules.execute(
        schedule,
        action === "approve" || !schedule.requiresApproval,
      );
    }
  }

  const needsSetup = !system?.magent_version || !magentOk;

  return (
    <div
      className={`app-shell ${railCollapsed ? "rail-collapsed" : ""}`}
      data-theme={theme === "system" ? (systemDark ? "dark" : "light") : theme}
      data-accent={accent}
    >
      <AppRail
        view={view}
        collapsed={railCollapsed}
        mobileOpen={mobileNavOpen}
        onNavigate={navigate}
        onToggle={() => setRailCollapsed((value) => !value)}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <ContextSidebar
        view={view}
        project={project}
        pinned={pinnedProjects.includes(project)}
        sessions={chatSessions}
        activeSession={chatSession}
        tasks={execution.tasks}
        onNavigate={navigate}
        onProject={chooseProjectFolder}
        onPin={() => togglePinnedProject()}
        onSession={(id) => {
          setChatSession(id);
          navigate("chat");
        }}
      />
      <main className="workspace">
        <WorkspaceHeader
          title={shellTitle}
          project={project}
          status={needsSetup ? "Setup needed" : projectHealth}
          theme={theme === "system" ? (systemDark ? "dark" : "light") : theme}
          onTheme={() => setTheme(theme === "light" ? "dark" : "light")}
          onMenu={() => setMobileNavOpen(true)}
          onPalette={() => setPaletteOpen(true)}
          onDetect={detectMagent}
          onReadiness={runReadiness}
          onDiagnostics={exportDiagnostics}
          onNotifications={enableNotifications}
        />

        {needsSetup && !setupDismissed && view !== "setup" && (
          <button
            className="setup-strip"
            onClick={() => navigate("setup")}
            type="button"
          >
            <span>
              MagAgent {minimumMagentVersion}+ is required for the full
              workspace.
            </span>
            <strong>Review setup →</strong>
          </button>
        )}

        <div className="workspace-content">
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
              ecosystemReadiness={ecosystemReadiness}
              toolReadiness={toolReadiness}
              providerDetection={providerDetection}
              cacheReadiness={cacheReadiness}
              projectInspection={projectInspection}
              commandHistory={commandHistory}
              lastCommand={lastCommand}
              onSystem={detectMagent}
              onReadiness={runReadiness}
              onEcosystemReadiness={runEcosystemReadiness}
              onEnvironment={runEnvironmentDiagnostics}
              onInspectProject={refreshProjectHealth}
            />
          )}

          {view === "chat" && (
            <ChatPanel
              busy={
                chatBusy ||
                execution.tasks.some((task) =>
                  activeExecutionStates.has(task.state),
                )
              }
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
              onForkSession={forkChatSession}
              onCompactSession={compactChatSession}
              onExportSession={exportChatSession}
              onConfigureGroup={configureGroup}
              onPermissionMode={setSessionPermissionMode}
              profiles={profiles.profiles}
              agentProfile={activeProfile}
              profileDrifted={profileDrifted}
              onAgentProfileChange={selectSessionProfile}
              streamLines={streamLines}
              response={chatResponse}
              events={chatEvents}
              history={chatHistory}
              quickPrompts={quickPrompts}
              project={project}
              allProjects={allProjects}
              onProjectSelect={rememberProject}
              onOpenProject={chooseProjectFolder}
              cockpit={chatCockpit}
              tasks={execution.tasks}
              activeTask={execution.activeTask}
              taskEvents={execution.events}
              taskError={execution.error}
              recoveredTaskIds={execution.recoveredTaskIds}
              artifactPreview={artifactPreview}
              onPreviewArtifact={previewArtifact}
              onCloseArtifact={() => setArtifactPreview(null)}
              onSelectTask={execution.selectTask}
              onTaskAction={execution.controlTask}
              onRun={runAsk}
              onCreateOrchestratedGoal={createOrchestratedGoal}
              onClear={() => {
                setChatHistory([]);
                setChatEvents([]);
                setChatResponse(null);
              }}
              contextFiles={workspaceContext}
              onRemoveContext={(path) =>
                setWorkspaceContext((current) =>
                  current.filter((item) => item.path !== path),
                )
              }
              onOpenWorkspace={() => navigate("workspace")}
            />
          )}

          {view === "workspace" && (
            <Suspense
              fallback={
                <div className="panel loading-panel">
                  Loading workspace tools…
                </div>
              }
            >
              <WorkspacePanel
                project={project}
                sessionId={chatSession}
                context={workspaceContext}
                onContextChange={setWorkspaceContext}
                onProjectOpen={rememberProject}
                notify={notify}
              />
            </Suspense>
          )}

          {view === "tools" && (
            <Suspense
              fallback={
                <div className="panel loading-panel">
                  Loading extension inventory…
                </div>
              }
            >
              <ToolsPanel project={project} notify={notify} />
            </Suspense>
          )}

          {view === "agents" && (
            <Suspense
              fallback={
                <div className="panel loading-panel">Loading agents…</div>
              }
            >
              <AgentsPanel
                runtime={profiles}
                project={project}
                crew={projectCrew}
                onCrewChange={updateProjectCrew}
                onUseInChat={openProfileInChat}
              />
            </Suspense>
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
            <>
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
              <div className="settings-extensions">
                <RuntimeTransportPanel notify={notify} />
                <KeepAwakePanel notify={notify} />
              </div>
              <div className="settings-extensions">
                <AppearancePanel
                  theme={theme}
                  accent={accent}
                  onTheme={setTheme}
                  onAccent={setAccent}
                />
                <ShortcutEditor shortcuts={shortcuts} onChange={setShortcuts} />
              </div>
            </>
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
              batchText={memoryBatchText}
              setBatchText={setMemoryBatchText}
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
              onBatch={applyMemoryBatch}
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
              graphPath={graphPath}
              setGraphPath={setGraphPath}
              graphActivity={graphActivity}
              result={workbenchResult}
              commandHistory={commandHistory}
              checkpoints={workbench.checkpoints}
              selectedCheckpoint={workbench.selectedCheckpoint}
              checkpointDiff={workbench.checkpointDiff}
              peers={workbench.peers}
              peerTarget={workbench.peerTarget}
              peerMessage={workbench.peerMessage}
              setPeerTarget={workbench.setPeerTarget}
              setPeerMessage={workbench.setPeerMessage}
              onListRecipes={listRecipes}
              onRunRecipe={runRecipe}
              onInspectPatch={inspectPatch}
              onChooseGraph={chooseGraphFile}
              onValidateGraph={() => inspectGraph("validate")}
              onPlanGraph={() => inspectGraph("plan")}
              onRunGraph={runGraph}
              onLoadCheckpoints={workbench.loadCheckpoints}
              onInspectCheckpoint={workbench.inspectCheckpoint}
              onRestoreCheckpoint={workbench.restoreCheckpoint}
              onLoadPeers={workbench.loadPeers}
              onSendPeerMessage={workbench.sendPeerMessage}
            />
          )}

          {view === "graphs" && (
            <Suspense
              fallback={
                <div className="panel loading-panel">Loading Graph Board…</div>
              }
            >
              <GraphBoardPanel
                project={project}
                profiles={profiles.profiles}
                notify={notify}
                onDirtyChange={setGraphDirty}
              />
            </Suspense>
          )}

          {view === "runs" && (
            <Suspense
              fallback={
                <div className="panel loading-panel">Loading runs…</div>
              }
            >
              <RunCenterPanel
                tasks={execution.tasks}
                activeTask={execution.activeTask}
                events={execution.events}
                error={execution.error}
                recoveredTaskIds={execution.recoveredTaskIds}
                onSelect={execution.selectTask}
                onAction={execution.controlTask}
                onPreviewArtifact={previewArtifact}
                schedules={schedules.schedules.filter(
                  (item) => item.project === project,
                )}
                onCreateSchedule={createSchedule}
                onScheduleAction={scheduleAction}
              />
            </Suspense>
          )}

          {view === "library" && <LibraryLanding onNavigate={navigate} />}

          {view === "docs" && (
            <Suspense
              fallback={
                <div className="panel loading-panel">Loading help…</div>
              }
            >
              <DocsPanel />
            </Suspense>
          )}
        </div>
        <ToastStack toasts={toasts} />
      </main>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        onDetect={detectMagent}
        onReadiness={runReadiness}
        projects={allProjects}
        sessions={chatSessions}
        profiles={profiles.profiles.map((item) => item.name)}
        tasks={execution.tasks}
        onProject={rememberProject}
        onSession={(id) => {
          setChatSession(id);
          navigate("chat");
        }}
      />
    </div>
  );
}
