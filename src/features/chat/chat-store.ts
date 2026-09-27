import { create } from "zustand";
import { defaultProject, quickPrompts, storageKeys } from "../../lib/constants";
import type {
  ArtifactPreview,
  ChatMessage,
  ChatSession,
  WorkspaceFile,
} from "../../lib/types";
import { normalizeSessions } from "../../lib/workspace";
import { readStoredJson, readStoredString } from "../../lib/utils";

export type ChatEvent = Record<string, unknown>;

export type ChatState = {
  prompt: string;
  session: string;
  sessions: ChatSession[];
  sessionDraftName: string;
  streamLines: string[];
  response: Record<string, unknown> | null;
  history: ChatMessage[];
  events: ChatEvent[];
  busy: boolean;
  /** Workspace files attached to the next ask. */
  context: WorkspaceFile[];
  artifactPreview: ArtifactPreview | null;
  /** The run Stop should end when it has no durable task (for example a Loro run). */
  activeStream: { id: string; harness: "magent" | "loro" } | null;
};

type Updater<T> = T | ((current: T) => T);

export type ChatActions = {
  set: (partial: Partial<ChatState>) => void;
  setPrompt: (value: Updater<string>) => void;
  setSessions: (value: Updater<ChatSession[]>) => void;
  setHistory: (value: Updater<ChatMessage[]>) => void;
  setEvents: (value: Updater<ChatEvent[]>) => void;
  setStreamLines: (value: Updater<string[]>) => void;
  setContext: (value: Updater<WorkspaceFile[]>) => void;
  /** Applies `patch` to the active session and bumps its updatedAt. */
  patchActiveSession: (patch: Partial<ChatSession>) => void;
  clearTranscript: () => void;
};

function resolve<T>(value: Updater<T>, current: T): T {
  return typeof value === "function"
    ? (value as (current: T) => T)(current)
    : value;
}

export function initialChatState(): ChatState {
  const project = readStoredString(storageKeys.project, defaultProject);
  return {
    prompt: quickPrompts[0],
    session: "default",
    sessions: normalizeSessions(
      readStoredJson<unknown>(`${storageKeys.chatSessions}:${project}`, [
        "default",
      ]),
    ),
    sessionDraftName: "",
    streamLines: [],
    response: null,
    history: readStoredJson<ChatMessage[]>(
      `${storageKeys.chat}:${project}:default`,
      [],
    ),
    events: [],
    busy: false,
    context: [],
    artifactPreview: null,
    activeStream: null,
  };
}

export const useChatStore = create<ChatState & ChatActions>()((set) => ({
  ...initialChatState(),
  set: (partial) => set(partial),
  setPrompt: (value) => set((s) => ({ prompt: resolve(value, s.prompt) })),
  setSessions: (value) =>
    set((s) => ({ sessions: resolve(value, s.sessions) })),
  setHistory: (value) => set((s) => ({ history: resolve(value, s.history) })),
  setEvents: (value) => set((s) => ({ events: resolve(value, s.events) })),
  setStreamLines: (value) =>
    set((s) => ({ streamLines: resolve(value, s.streamLines) })),
  setContext: (value) => set((s) => ({ context: resolve(value, s.context) })),
  patchActiveSession: (patch) =>
    set((s) => ({
      sessions: s.sessions.map((item) =>
        item.id === s.session
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item,
      ),
    })),
  clearTranscript: () => set({ history: [], events: [], response: null }),
}));
