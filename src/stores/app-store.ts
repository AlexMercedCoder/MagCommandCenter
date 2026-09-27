import { create } from "zustand";
import { defaultProject, storageKeys } from "../lib/constants";
import { defaultShortcuts, type ShortcutMap } from "../lib/keybindings";
import { recordPerformance } from "../lib/performance";
import type {
  Accent,
  CacheReadiness,
  EcosystemReadiness,
  ProjectCrew,
  ProjectInspection,
  ProviderDetection,
  Readiness,
  SetupMethod,
  SystemInfo,
  Theme,
  Toast,
  ToolReadiness,
  View,
} from "../lib/types";
import { readStoredJson, readStoredString } from "../lib/utils";
import type { MagentCommandResult } from "../magent";

/**
 * Shell-wide state: navigation, appearance, the active project, MagAgent detection,
 * command history, and toasts. Feature state (chat, memory, SQLite, ...) lives in
 * feature stores under src/features.
 */
export type AppState = {
  // Navigation and chrome
  view: View;
  railCollapsed: boolean;
  mobileNavOpen: boolean;
  paletteOpen: boolean;
  shortcuts: ShortcutMap;
  graphDirty: boolean;
  theme: Theme;
  systemDark: boolean;
  accent: Accent;
  toasts: Toast[];
  /** OS notifications while the window is in the background (C-8). */
  notifications: { approvals: boolean; runs: boolean };

  // Projects
  project: string;
  recentProjects: string[];
  pinnedProjects: string[];
  projectCrews: Record<string, ProjectCrew>;

  // MagAgent and diagnostics
  system: SystemInfo | null;
  busy: boolean;
  lastCommand: MagentCommandResult | null;
  commandHistory: MagentCommandResult[];
  setupMethod: SetupMethod;
  setupDismissed: boolean;
  readiness: Readiness | null;
  ecosystemReadiness: EcosystemReadiness | null;
  toolReadiness: ToolReadiness | null;
  providerDetection: ProviderDetection | null;
  cacheReadiness: CacheReadiness | null;
  projectInspection: ProjectInspection | null;

  /** True once persisted state has been loaded from the native store. */
  persistenceReady: boolean;
};

export type AppActions = {
  set: (partial: Partial<AppState>) => void;
  notify: (text: string, tone?: Toast["tone"]) => void;
  /** Changes view, asking first when leaving an unsaved Graph Board draft. */
  navigate: (next: View) => void;
  recordCommand: (result: MagentCommandResult, announce?: boolean) => void;
  rememberProject: (path?: string) => void;
  togglePinnedProject: (path?: string) => void;
  updateProjectCrew: (crew: ProjectCrew) => void;
  setBusy: (busy: boolean) => void;
};

export function initialAppState(): AppState {
  return {
    view: "setup",
    railCollapsed: readStoredString("mcc.railCollapsed", "false") === "true",
    mobileNavOpen: false,
    paletteOpen: false,
    shortcuts: readStoredJson("mcc.shortcuts.v1", defaultShortcuts),
    graphDirty: false,
    theme: readStoredString(storageKeys.theme, "light") as Theme,
    systemDark:
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false),
    accent: readStoredString(storageKeys.accent, "yellow") as Accent,
    toasts: [],
    notifications: readStoredJson(storageKeys.notifications, {
      approvals: true,
      runs: true,
    }),
    project: readStoredString(storageKeys.project, defaultProject),
    recentProjects: readStoredJson<string[]>(storageKeys.projects, []).filter(
      Boolean,
    ),
    pinnedProjects: readStoredJson<string[]>(storageKeys.pinnedProjects, []),
    projectCrews: readStoredJson(storageKeys.projectCrews, {}),
    system: null,
    busy: false,
    lastCommand: null,
    commandHistory: readStoredJson<MagentCommandResult[]>(
      storageKeys.commands,
      [],
    ),
    setupMethod: readStoredString(
      storageKeys.setupMethod,
      "pipx-install",
    ) as SetupMethod,
    setupDismissed:
      readStoredString(storageKeys.setupDismissed, "false") === "true",
    readiness: null,
    ecosystemReadiness: null,
    toolReadiness: null,
    providerDetection: null,
    cacheReadiness: null,
    projectInspection: null,
    persistenceReady: false,
  };
}

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  ...initialAppState(),
  set: (partial) => set(partial),
  notify: (text, tone = "info") => {
    const toast = { id: crypto.randomUUID(), tone, text };
    set((state) => ({ toasts: [toast, ...state.toasts].slice(0, 4) }));
    window.setTimeout(
      () =>
        set((state) => ({
          toasts: state.toasts.filter((item) => item.id !== toast.id),
        })),
      5000,
    );
  },
  navigate: (next) => {
    const { view, graphDirty } = get();
    if (
      view === "graphs" &&
      next !== "graphs" &&
      graphDirty &&
      !window.confirm(
        "Leave Graph Board? Your unsaved draft is recoverable, but it has not been written to the graph file.",
      )
    )
      return;
    set({ view: next, mobileNavOpen: false });
  },
  recordCommand: (result, announce = true) => {
    set((state) => ({
      lastCommand: result,
      commandHistory: [result, ...state.commandHistory].slice(0, 80),
    }));
    if (announce)
      get().notify(
        result.ok ? "Command completed" : "Command needs review",
        result.ok ? "good" : "bad",
      );
  },
  rememberProject: (path) => {
    const startedAt = performance.now();
    const trimmed = (path ?? get().project).trim();
    if (!trimmed) return;
    set((state) => ({
      project: trimmed,
      recentProjects: [
        trimmed,
        ...state.recentProjects.filter((item) => item !== trimmed),
      ].slice(0, 12),
    }));
    window.requestAnimationFrame(() =>
      recordPerformance("project.switch", startedAt),
    );
  },
  togglePinnedProject: (path) => {
    const trimmed = (path ?? get().project).trim();
    if (!trimmed) return;
    set((state) => ({
      pinnedProjects: state.pinnedProjects.includes(trimmed)
        ? state.pinnedProjects.filter((item) => item !== trimmed)
        : [trimmed, ...state.pinnedProjects].slice(0, 12),
    }));
    get().rememberProject(trimmed);
  },
  updateProjectCrew: (crew) =>
    set((state) => ({
      projectCrews: { ...state.projectCrews, [state.project]: crew },
    })),
  setBusy: (busy) => set({ busy }),
}));

/** Resolved light/dark theme for rendering. */
export function effectiveTheme(state: Pick<AppState, "theme" | "systemDark">) {
  return state.theme === "system"
    ? state.systemDark
      ? "dark"
      : "light"
    : state.theme;
}

export function projectCrewFor(
  state: Pick<AppState, "projectCrews" | "project">,
): ProjectCrew {
  return (
    state.projectCrews[state.project] ?? {
      project: state.project,
      coordinator: "",
      members: [],
    }
  );
}
