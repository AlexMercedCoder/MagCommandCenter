import { GitFork } from "lucide-react";
import { useMemo } from "react";
import { filterNodeIds, graphDiagnostics } from "../graph-model";
import type { BoardContext } from "./actions";
import { GraphMeta, GraphWarnings, KnownGraphs } from "./document-bar";
import { GraphDrawer } from "./drawer";
import { useGraphBoardEffects } from "./effects";
import { GraphEditorArea } from "./editor-area";
import { GraphControls, GraphStart } from "./graph-start";
import { blankGraph, generate, loadGraph } from "./actions";
import { useGraphBoard } from "./store";
import { GenerationStatus, GraphToolbar } from "./toolbar";
import { localDigest, type GraphBoardProps } from "./utils";

export function GraphBoardPanel({
  project,
  profiles: knownProfiles,
  notify,
  onDirtyChange,
}: GraphBoardProps) {
  useGraphBoardEffects({ project, notify, onDirtyChange });
  const ctx: BoardContext = useMemo(
    () => ({ project, notify }),
    [project, notify],
  );
  const state = useGraphBoard();
  const { document, contract, plan, planDigest, childTasks, set } = state;

  const diagnostics = useMemo(
    () => (document ? graphDiagnostics(document) : []),
    [document],
  );
  const profiles = contract?.profiles ?? knownProfiles;
  const nodeCount = document ? Object.keys(document.nodes).length : 0;
  const labels = useMemo(
    () =>
      document
        ? [
            ...new Set(
              Object.values(document.nodes).flatMap(
                (node) => node.labels ?? [],
              ),
            ),
          ].sort()
        : [],
    [document],
  );
  const visible = useMemo(
    () =>
      document
        ? filterNodeIds(
            document,
            state.query,
            state.typeFilter,
            state.profileFilter,
            state.labelFilter,
          )
        : new Set<string>(),
    [
      document,
      state.query,
      state.typeFilter,
      state.profileFilter,
      state.labelFilter,
    ],
  );
  const stalePlan = Boolean(
    plan && document && planDigest && planDigest !== localDigest(document),
  );
  const nodeStates = useMemo(
    () =>
      new Map(
        childTasks.map((task) => [
          String(task.metadata.node_id ?? task.metadata.scope_path ?? ""),
          task,
        ]),
      ),
    [childTasks],
  );

  return (
    <section
      className={
        state.compact || nodeCount >= 100
          ? "graph-workspace compact"
          : "graph-workspace"
      }
    >
      <GraphToolbar
        ctx={ctx}
        hasErrors={diagnostics.some((item) => item.severity === "error")}
        stalePlan={stalePlan}
      />
      <GenerationStatus />
      <GraphStart
        goal={state.goal}
        setGoal={(goal) => set({ goal })}
        busy={state.busy}
        hasDocument={Boolean(document)}
        onGenerate={(model) => generate(ctx, model)}
        onBlank={blankGraph}
        onOpen={() => loadGraph(ctx)}
      />
      {document ? (
        <>
          <GraphMeta stalePlan={stalePlan} />
          <GraphControls
            view={state.view}
            setView={(view) => set({ view })}
            query={state.query}
            setQuery={(query) => set({ query })}
            type={state.typeFilter}
            setType={(typeFilter) => set({ typeFilter })}
            profile={state.profileFilter}
            setProfile={(profileFilter) => set({ profileFilter })}
            label={state.labelFilter}
            setLabel={(labelFilter) => set({ labelFilter })}
            profiles={profiles}
            labels={labels}
            compact={state.compact}
            setCompact={(compact) => set({ compact })}
          />
          <KnownGraphs ctx={ctx} />
          <GraphWarnings ctx={ctx} diagnostics={diagnostics} />
          <GraphEditorArea
            ctx={ctx}
            visible={visible}
            profiles={profiles}
            nodeStates={nodeStates}
          />
          <GraphDrawer ctx={ctx} stalePlan={stalePlan} />
        </>
      ) : (
        <div className="graph-empty-state panel">
          <GitFork size={30} />
          <div>
            <strong>No graph loaded</strong>
            <p>
              Generate a graph with AI, start blank, or open an existing AGS
              file above.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
