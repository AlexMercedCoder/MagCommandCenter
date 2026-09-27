import { create } from "zustand";
import type {
  AgenticGraphDocument,
  EffectiveAgentProfile,
  ExecutionTask,
  GraphAuthoringContract,
} from "../../../lib/types";
import type { Proposal, ViewMode, WorkspacePanel } from "./utils";

/** Everything the Graph Board shows or edits. One board exists per window. */
export type GraphBoardState = {
  document: AgenticGraphDocument | null;
  baseline: AgenticGraphDocument | null;
  contract: GraphAuthoringContract | null;
  path: string;
  digest: string;
  selected: string;
  multi: Set<string>;
  goal: string;
  assistantPrompt: string;
  proposal: Proposal | null;
  proposalSelection: Set<number>;
  plan: Record<string, unknown> | null;
  planDigest: string;
  activity: string[];
  busy: boolean;
  generationStarted: number | null;
  dirty: boolean;
  past: AgenticGraphDocument[];
  future: AgenticGraphDocument[];
  view: ViewMode;
  workspacePanel: WorkspacePanel;
  compact: boolean;
  presentationOrder: string[];
  query: string;
  typeFilter: string;
  profileFilter: string;
  labelFilter: string;
  sourceText: string;
  sourceError: string;
  approvedGates: Set<string>;
  runTask: ExecutionTask | null;
  childTasks: ExecutionTask[];
  effectiveProfile: EffectiveAgentProfile | null;
  recentGraphs: string[];
  pinnedGraphs: string[];
  externalDocument: { document: AgenticGraphDocument; digest: string } | null;
  /** Native stream id of the graph run in progress, for cancellation. */
  streamId: string;
};

type Updater<T> = T | ((current: T) => T);

export type GraphBoardActions = {
  set: (partial: Partial<GraphBoardState>) => void;
  setActivity: (value: Updater<string[]>) => void;
  setPresentationOrder: (value: Updater<string[]>) => void;
  /** Records an edit: pushes undo history and invalidates the plan and proposal. */
  commit: (next: AgenticGraphDocument) => void;
  undo: () => void;
  redo: () => void;
  /** Replaces the document wholesale (open, generate, blank, template). */
  replaceDocument: (
    next: AgenticGraphDocument,
    options: {
      baseline: AgenticGraphDocument | null;
      path: string;
      digest: string;
      dirty: boolean;
    },
  ) => void;
  movePresentation: (id: string, delta: number) => void;
};

export function initialGraphBoardState(): GraphBoardState {
  return {
    document: null,
    baseline: null,
    contract: null,
    path: "",
    digest: "",
    selected: "",
    multi: new Set(),
    goal: "",
    assistantPrompt: "",
    proposal: null,
    proposalSelection: new Set(),
    plan: null,
    planDigest: "",
    activity: [],
    busy: false,
    generationStarted: null,
    dirty: false,
    past: [],
    future: [],
    view: "board",
    workspacePanel: "assistant",
    compact: false,
    presentationOrder: [],
    query: "",
    typeFilter: "",
    profileFilter: "",
    labelFilter: "",
    sourceText: "",
    sourceError: "",
    approvedGates: new Set(),
    runTask: null,
    childTasks: [],
    effectiveProfile: null,
    recentGraphs: [],
    pinnedGraphs: [],
    externalDocument: null,
    streamId: "",
  };
}

function resolve<T>(value: Updater<T>, current: T): T {
  return typeof value === "function"
    ? (value as (current: T) => T)(current)
    : value;
}

export const useGraphBoard = create<GraphBoardState & GraphBoardActions>()(
  (set, get) => ({
    ...initialGraphBoardState(),
    set: (partial) => set(partial),
    setActivity: (value) =>
      set((state) => ({ activity: resolve(value, state.activity) })),
    setPresentationOrder: (value) =>
      set((state) => ({
        presentationOrder: resolve(value, state.presentationOrder),
      })),
    commit: (next) => {
      const { document } = get();
      set((state) => ({
        past: document ? [...state.past.slice(-49), document] : state.past,
        future: [],
        document: next,
        dirty: true,
        plan: null,
        planDigest: "",
        proposal: null,
      }));
    },
    undo: () => {
      const { document, past } = get();
      if (!document || !past.length) return;
      set((state) => ({
        future: [document, ...state.future].slice(0, 50),
        past: state.past.slice(0, -1),
        document: past[past.length - 1],
        dirty: true,
        plan: null,
      }));
    },
    redo: () => {
      const { document, future } = get();
      if (!document || !future.length) return;
      set((state) => ({
        past: [...state.past, document].slice(-50),
        future: state.future.slice(1),
        document: future[0],
        dirty: true,
        plan: null,
      }));
    },
    replaceDocument: (next, options) =>
      set({
        document: next,
        baseline: options.baseline,
        path: options.path,
        digest: options.digest,
        dirty: options.dirty,
        plan: null,
        past: [],
        future: [],
        selected: Object.keys(next.nodes)[0] ?? "",
      }),
    movePresentation: (id, delta) =>
      set((state) => {
        const next = [...state.presentationOrder];
        const index = next.indexOf(id);
        const target = Math.max(0, Math.min(next.length - 1, index + delta));
        if (index < 0 || index === target) return {};
        next.splice(index, 1);
        next.splice(target, 0, id);
        return { presentationOrder: next };
      }),
  }),
);
