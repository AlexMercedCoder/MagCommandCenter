import { useEffect } from "react";
import { useChatStore } from "../features/chat/chat-store";
import { useSqliteStore } from "../features/sqlite/sqlite-store";
import { storageKeys } from "../lib/constants";
import { loadAppState, saveAppState } from "../lib/persistence";
import { recordPerformance } from "../lib/performance";
import type { ChatMessage } from "../lib/types";
import { readStoredJson } from "../lib/utils";
import { normalizeSessions } from "../lib/workspace";
import { useAppStore, type AppState } from "./app-store";

/** App-store fields persisted to the native state database, by storage key. */
const persistedAppFields = {
  [storageKeys.theme]: "theme",
  [storageKeys.accent]: "accent",
  [storageKeys.projects]: "recentProjects",
  [storageKeys.pinnedProjects]: "pinnedProjects",
  [storageKeys.setupMethod]: "setupMethod",
  [storageKeys.setupDismissed]: "setupDismissed",
  [storageKeys.projectCrews]: "projectCrews",
} as const satisfies Record<string, keyof AppState>;

function persistValue(key: string, value: unknown) {
  if (key === storageKeys.commands) return (value as unknown[]).slice(0, 500);
  return value;
}

async function hydrate(startedAt: number) {
  const app = useAppStore.getState();
  const loaded: Partial<AppState> = {
    project: await loadAppState(storageKeys.project, app.project),
    commandHistory: await loadAppState(
      storageKeys.commands,
      app.commandHistory,
    ),
  };
  for (const [key, field] of Object.entries(persistedAppFields)) {
    (loaded as Record<string, unknown>)[field] = await loadAppState(
      key,
      app[field],
    );
  }
  const sqlite = useSqliteStore.getState();
  sqlite.set({
    savedQueries: await loadAppState(
      storageKeys.sqliteSavedQueries,
      sqlite.savedQueries,
    ),
  });
  useAppStore.getState().set({ ...loaded, persistenceReady: true });
  recordPerformance("desktop.startup", startedAt);
}

async function loadSessions(project: string) {
  const stored = await loadAppState<unknown>(
    `${storageKeys.chatSessions}:${project}`,
    readStoredJson<unknown>(`${storageKeys.chatSessions}:${project}`, [
      "default",
    ]),
  );
  const sessions = normalizeSessions(stored);
  const current = useChatStore.getState().session;
  useChatStore.getState().set({
    sessions,
    session: sessions.some((item) => item.id === current)
      ? current
      : (sessions[0]?.id ?? "default"),
  });
}

async function loadHistory(project: string, session: string) {
  const key = `${storageKeys.chat}:${project}:${session}`;
  const history = await loadAppState(
    key,
    readStoredJson<ChatMessage[]>(key, []),
  );
  useChatStore.getState().set({ history });
}

/**
 * Loads persisted state once, then writes each persisted field back whenever it
 * changes. Chat sessions and transcripts are keyed by project and session.
 */
export function usePersistence(startedAt: number) {
  const ready = useAppStore((state) => state.persistenceReady);

  useEffect(() => {
    void hydrate(startedAt);
  }, [startedAt]);

  useEffect(() => {
    if (!ready) return;
    const { project } = useAppStore.getState();
    void saveAppState(storageKeys.project, project);
    void loadSessions(project).then(() =>
      loadHistory(project, useChatStore.getState().session),
    );

    const unsubscribeApp = useAppStore.subscribe((state, previous) => {
      for (const [key, field] of Object.entries(persistedAppFields)) {
        if (state[field] !== previous[field])
          void saveAppState(key, persistValue(key, state[field]));
      }
      if (state.commandHistory !== previous.commandHistory)
        void saveAppState(
          storageKeys.commands,
          persistValue(storageKeys.commands, state.commandHistory),
        );
      if (state.project !== previous.project) {
        void saveAppState(storageKeys.project, state.project);
        const project = state.project;
        void loadSessions(project).then(() =>
          loadHistory(project, useChatStore.getState().session),
        );
        useChatStore.getState().set({ context: [] });
      }
    });
    const unsubscribeChat = useChatStore.subscribe((state, previous) => {
      const { project } = useAppStore.getState();
      if (state.session !== previous.session) {
        useChatStore.getState().set({ context: [] });
        void loadHistory(project, state.session);
      }
      if (
        state.sessions !== previous.sessions ||
        state.session !== previous.session
      )
        void saveAppState(
          `${storageKeys.chatSessions}:${project}`,
          state.sessions,
        );
      if (state.history !== previous.history)
        void saveAppState(
          `${storageKeys.chat}:${project}:${state.session}`,
          state.history.slice(-1000),
        );
    });
    const unsubscribeSqlite = useSqliteStore.subscribe((state, previous) => {
      if (state.savedQueries !== previous.savedQueries)
        void saveAppState(
          storageKeys.sqliteSavedQueries,
          state.savedQueries.slice(0, 100),
        );
    });
    return () => {
      unsubscribeApp();
      unsubscribeChat();
      unsubscribeSqlite();
    };
  }, [ready]);

  // Per-device conveniences stay in localStorage, as before.
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        try {
          if (state.railCollapsed !== previous.railCollapsed)
            localStorage.setItem(
              "mcc.railCollapsed",
              String(state.railCollapsed),
            );
          if (state.shortcuts !== previous.shortcuts)
            localStorage.setItem(
              "mcc.shortcuts.v1",
              JSON.stringify(state.shortcuts),
            );
        } catch {
          // Storage can be unavailable; the setting then lasts for this session.
        }
      }),
    [],
  );
}
