import { Check, FolderOpen, Play, Redo2, Save, Undo2 } from "lucide-react";
import type { GraphNodeType } from "../../../lib/types";
import { addNode } from "../graph-model";
import {
  loadGraph,
  previewPlan,
  runGraph,
  saveGraph,
  type BoardContext,
} from "./actions";
import { useGraphBoard } from "./store";
import { nodeTypes } from "./utils";
import { useGenerationElapsed } from "./effects";

export function GraphToolbar(props: {
  ctx: BoardContext;
  hasErrors: boolean;
  stalePlan: boolean;
}) {
  const { ctx } = props;
  const document = useGraphBoard((state) => state.document);
  const contract = useGraphBoard((state) => state.contract);
  const busy = useGraphBoard((state) => state.busy);
  const dirty = useGraphBoard((state) => state.dirty);
  const plan = useGraphBoard((state) => state.plan);
  const canUndo = useGraphBoard((state) => state.past.length > 0);
  const canRedo = useGraphBoard((state) => state.future.length > 0);
  const { commit, undo, redo } = useGraphBoard.getState();
  return (
    <header className="graph-toolbar panel">
      <div>
        <p className="label">Agentic Graph Spec 1.0</p>
        <h3>{document?.title ?? "Visual workflow authoring"}</h3>
        <p className="muted">
          Dependencies determine execution. Presentation order and labels never
          change behavior.
        </p>
      </div>
      <div className="row-actions">
        <button
          className="icon-action"
          onClick={() => void loadGraph(ctx)}
          disabled={busy}
          type="button"
        >
          <FolderOpen size={16} />
          <span>Open</span>
        </button>
        {document && (
          <select
            aria-label="Create card type"
            defaultValue=""
            onChange={(event) => {
              const type = event.target.value as GraphNodeType;
              if (type) {
                commit(
                  addNode(document, type, contract?.node_templates?.[type]),
                );
                event.target.value = "";
              }
            }}
          >
            <option value="" disabled>
              + Card
            </option>
            {nodeTypes.map((type) => (
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
        )}
        <button
          className="icon-action"
          onClick={undo}
          disabled={!canUndo}
          type="button"
        >
          <Undo2 size={16} />
          <span>Undo</span>
        </button>
        <button
          className="icon-action"
          onClick={redo}
          disabled={!canRedo}
          type="button"
        >
          <Redo2 size={16} />
          <span>Redo</span>
        </button>
        <button
          className="icon-action"
          onClick={() => void previewPlan(ctx)}
          disabled={busy || !document || props.hasErrors}
          type="button"
        >
          <Check size={16} />
          <span>Validate</span>
        </button>
        <button
          className="icon-action"
          onClick={() => void saveGraph(ctx, false)}
          disabled={busy || !document}
          type="button"
        >
          <Save size={16} />
          <span>{dirty ? "Save changes" : "Saved"}</span>
        </button>
        <button
          className="primary-action"
          onClick={() => void runGraph(ctx)}
          disabled={busy || !document || dirty || !plan || props.stalePlan}
          type="button"
        >
          <Play size={16} />
          <span>Run graph</span>
        </button>
      </div>
    </header>
  );
}

export function GenerationStatus() {
  const started = useGraphBoard((state) => state.generationStarted);
  const elapsed = useGenerationElapsed();
  if (!started) return null;
  return (
    <div className="operation-health panel" role="status" aria-live="polite">
      <span className="operation-spinner" aria-hidden="true" />
      <div>
        <strong>Generating and validating the graph</strong>
        <p>
          {elapsed >= 90
            ? "This is taking longer than usual. The underlying MagAgent provider request is bounded and can be cancelled from its task controls. "
            : ""}
          The planning service is authoring a bounded draft, then validating its
          structure. This reports lifecycle progress, not private model
          reasoning; the board stays mounted if you navigate elsewhere.
        </p>
      </div>
      <b>{elapsed}s</b>
    </div>
  );
}
