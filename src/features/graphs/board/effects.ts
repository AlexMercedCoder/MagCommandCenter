import { useEffect, useState } from "react";
import { loadAppState, saveAppState } from "../../../lib/persistence";
import { recordPerformance } from "../../../lib/performance";
import type { ExecutionTask } from "../../../lib/types";
import { magentClient } from "../../../magent";
import { measureGraphModel } from "../graph-model";
import { useGraphBoard } from "./store";
import {
  activeStates,
  draftKey,
  pinnedKey,
  recentKey,
  restoreDraft,
  type DraftRecord,
} from "./utils";

const board = () => useGraphBoard.getState();

/** Loads the contract, recovers drafts and runs, and restores recent graphs per project. */
function useProjectBootstrap(
  project: string,
  notify: (text: string, tone?: "info" | "good" | "bad") => void,
) {
  useEffect(() => {
    let disposed = false;
    void magentClient
      .graphContract(project)
      .then((value) => {
        if (!disposed) board().set({ contract: value });
      })
      .catch(() => board().set({ contract: null }));
    void restoreDraft(project).then((draft: DraftRecord | null) => {
      if (disposed || !draft) return;
      board().set({
        document: draft.document,
        baseline: draft.baseline,
        path: draft.path,
        digest: draft.digest,
        dirty: true,
        selected: Object.keys(draft.document.nodes)[0] ?? "",
      });
      notify("Recovered an unsaved Graph Board draft", "info");
    });
    void magentClient
      .listTasks(250)
      .then((tasks) => {
        const graphTasks = tasks.filter(
          (task) =>
            task.kind === "agentic_graph" && task.project_path === project,
        );
        const recovered =
          graphTasks.find((task) => activeStates.has(task.state)) ??
          graphTasks[0];
        if (!recovered || disposed) return;
        board().set({ runTask: recovered });
        void magentClient
          .childTasks(recovered.id)
          .then((children) => {
            if (!disposed) board().set({ childTasks: children });
          })
          .catch(() => undefined);
        const runId = String(recovered.metadata.run_id ?? "");
        if (runId)
          void magentClient
            .graphRun(runId)
            .then((status) => {
              const task = status.task as ExecutionTask | undefined;
              const nodes = Array.isArray(status.nodes)
                ? (status.nodes as Array<Record<string, unknown>>)
                : [];
              if (!disposed && task) board().set({ runTask: task });
              if (!disposed && nodes.length)
                board().set({
                  childTasks: nodes
                    .map((node) => node.task)
                    .filter(Boolean) as ExecutionTask[],
                });
            })
            .catch(() => undefined);
      })
      .catch(() => undefined);
    void Promise.all([
      loadAppState<string[]>(recentKey(project), []),
      loadAppState<string[]>(pinnedKey(project), []),
    ]).then(([recentGraphs, pinnedGraphs]) => {
      if (!disposed) board().set({ recentGraphs, pinnedGraphs });
    });
    return () => {
      disposed = true;
    };
  }, [project, notify]);
}

/** Autosaves a recoverable draft 400ms after the last edit. */
function useDraftAutosave(project: string) {
  const document = useGraphBoard((state) => state.document);
  const dirty = useGraphBoard((state) => state.dirty);
  const path = useGraphBoard((state) => state.path);
  const digest = useGraphBoard((state) => state.digest);
  const baseline = useGraphBoard((state) => state.baseline);
  useEffect(() => {
    if (!document || !dirty) return;
    const timer = window.setTimeout(
      () =>
        void saveAppState(draftKey(project), {
          document,
          path,
          digest,
          baseline,
          updatedAt: new Date().toISOString(),
        } satisfies DraftRecord).catch(() => undefined),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [document, dirty, path, digest, baseline, project]);
}

/** Polls the root task and its children every 750ms while a run is active. */
function useRunPolling() {
  const runId = useGraphBoard((state) => state.runTask?.id);
  const runState = useGraphBoard((state) => state.runTask?.state);
  useEffect(() => {
    if (!runId || !runState || !activeStates.has(runState)) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const [root, children] = await Promise.all([
          magentClient.task(runId),
          magentClient.childTasks(runId),
        ]);
        if (!disposed) board().set({ runTask: root, childTasks: children });
      } catch {
        /* The stream carries the actionable error. */
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 750);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [runId, runState]);
}

/** Every 5s, checks whether the file changed on disk since it was loaded or saved. */
function useExternalChangeCheck() {
  const path = useGraphBoard((state) => state.path);
  const digest = useGraphBoard((state) => state.digest);
  useEffect(() => {
    if (!path || !digest) return;
    let disposed = false;
    const check = async () => {
      try {
        const current = await magentClient.inspectGraph(path);
        if (!disposed)
          board().set({
            externalDocument:
              current.digest !== digest
                ? { document: current.document, digest: current.digest }
                : null,
          });
      } catch {
        /* Saving still performs the authoritative conflict check. */
      }
    };
    const timer = window.setInterval(() => void check(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [path, digest]);
}

/** Resolves the effective authority of the selected card's OAP profile. */
function useEffectiveProfile(project: string) {
  const profile = useGraphBoard(
    (state) => state.document?.nodes[state.selected]?.["x-magagent-profile"],
  );
  useEffect(() => {
    if (!profile) {
      board().set({ effectiveProfile: null });
      return;
    }
    void magentClient
      .effectiveProfile(profile, project)
      .then((effectiveProfile) => board().set({ effectiveProfile }))
      .catch(() => board().set({ effectiveProfile: null }));
  }, [profile, project]);
}

/** Warns before closing the window and reports dirty state to the shell. */
function useDirtyGuards(onDirtyChange?: (dirty: boolean) => void) {
  const dirty = useGraphBoard((state) => state.dirty);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
}

/** Keeps the presentation order in step with added and removed cards. */
function usePresentationOrder() {
  const nodeKey = useGraphBoard((state) =>
    state.document ? Object.keys(state.document.nodes).join("|") : "",
  );
  useEffect(() => {
    const ids = nodeKey ? nodeKey.split("|") : [];
    board().setPresentationOrder((current) => [
      ...current.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !current.includes(id)),
    ]);
  }, [nodeKey]);
}

function useModelMetrics() {
  const document = useGraphBoard((state) => state.document);
  useEffect(() => {
    if (document)
      recordPerformance("graph.model", 0, measureGraphModel(document));
  }, [document]);
}

/** Ticks the elapsed-seconds counter while a generation is running. */
export function useGenerationElapsed() {
  const started = useGraphBoard((state) => state.generationStarted);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!started) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [started, setElapsed]);
  return elapsed;
}

export function useGraphBoardEffects(options: {
  project: string;
  notify: (text: string, tone?: "info" | "good" | "bad") => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  useProjectBootstrap(options.project, options.notify);
  useDraftAutosave(options.project);
  useRunPolling();
  useExternalChangeCheck();
  useEffectiveProfile(options.project);
  useDirtyGuards(options.onDirtyChange);
  usePresentationOrder();
  useModelMetrics();
}
