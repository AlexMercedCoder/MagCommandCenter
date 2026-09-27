import { AlertTriangle } from "lucide-react";
import type { GraphDiagnostic } from "../graph-model";
import {
  openKnown,
  saveGraph,
  togglePinnedGraph,
  type BoardContext,
} from "./actions";
import { useGraphBoard } from "./store";

/** Title and objective fields plus the draft and plan status badges. */
export function GraphMeta(props: { stalePlan: boolean }) {
  const document = useGraphBoard((state) => state.document);
  const dirty = useGraphBoard((state) => state.dirty);
  const hasPlan = useGraphBoard((state) => Boolean(state.plan));
  const commit = useGraphBoard((state) => state.commit);
  if (!document) return null;
  return (
    <div className="graph-meta panel">
      <label>
        Graph title
        <input
          value={document.title}
          onChange={(event) =>
            commit({ ...document, title: event.target.value })
          }
        />
      </label>
      <label>
        Objective
        <textarea
          value={document.objective}
          onChange={(event) =>
            commit({ ...document, objective: event.target.value })
          }
        />
      </label>
      <div className="stacked-status">
        <span className={dirty ? "status-badge warning" : "status-badge good"}>
          {dirty ? "Recoverable draft" : "Saved"}
        </span>
        {hasPlan && (
          <span
            className={
              props.stalePlan ? "status-badge warning" : "status-badge good"
            }
          >
            {props.stalePlan ? "Plan stale" : "Plan digest matched"}
          </span>
        )}
      </div>
    </div>
  );
}

export function KnownGraphs(props: { ctx: BoardContext }) {
  const recent = useGraphBoard((state) => state.recentGraphs);
  const pinned = useGraphBoard((state) => state.pinnedGraphs);
  if (!pinned.length && !recent.length) return null;
  return (
    <div className="known-graphs panel">
      <strong>Recent graphs</strong>
      {[...new Set([...pinned, ...recent])].slice(0, 12).map((item) => (
        <span key={item}>
          <button
            onClick={() => void openKnown(props.ctx, item)}
            title={item}
            type="button"
          >
            {item.split(/[\\/]/).pop()}
          </button>
          <button
            aria-label={pinned.includes(item) ? `Unpin ${item}` : `Pin ${item}`}
            onClick={() => togglePinnedGraph(props.ctx.project, item)}
            type="button"
          >
            {pinned.includes(item) ? "★" : "☆"}
          </button>
        </span>
      ))}
    </div>
  );
}

export function GraphWarnings(props: {
  ctx: BoardContext;
  diagnostics: GraphDiagnostic[];
}) {
  const external = useGraphBoard((state) => state.externalDocument);
  const set = useGraphBoard((state) => state.set);
  return (
    <>
      {external && (
        <div className="graph-warning external-change">
          <AlertTriangle />
          The graph changed on disk.
          <button
            onClick={() =>
              set({
                document: external.document,
                baseline: structuredClone(external.document),
                digest: external.digest,
                dirty: false,
                externalDocument: null,
              })
            }
            type="button"
          >
            Reload disk version
          </button>
          <button onClick={() => set({ view: "source" })} type="button">
            Compare
          </button>
          <button onClick={() => void saveGraph(props.ctx, true)} type="button">
            Save as
          </button>
        </div>
      )}
      {props.diagnostics.map((item) => (
        <button
          className="graph-warning"
          key={`${item.code}-${item.nodeId ?? ""}`}
          onClick={() => item.nodeId && set({ selected: item.nodeId })}
          type="button"
        >
          <AlertTriangle size={18} />
          {item.message}
        </button>
      ))}
    </>
  );
}
