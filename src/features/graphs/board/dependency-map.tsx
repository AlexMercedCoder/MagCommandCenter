import { useState } from "react";
import { graphStages } from "../graph-model";
import type { AgenticGraphDocument } from "../../../lib/types";

export function DependencyMap({
  document,
  selected,
  onSelect,
  onChange,
}: {
  document: AgenticGraphDocument;
  selected: string;
  onSelect: (id: string) => void;
  onChange: (document: AgenticGraphDocument) => void;
}) {
  const ids = Object.keys(document.nodes);
  const [from, setFrom] = useState(ids[0] ?? "");
  const [to, setTo] = useState(ids[1] ?? ids[0] ?? "");
  const [kind, setKind] = useState<"sequence" | "conditional" | "on_failure">(
    "sequence",
  );
  const [when, setWhen] = useState("");
  const stages = graphStages(document).stages;
  const positions = new Map<string, { x: number; y: number }>();
  stages.forEach((stage, column) =>
    stage.nodeIds.forEach((id, row) =>
      positions.set(id, { x: 34 + column * 250, y: 34 + row * 116 }),
    ),
  );
  ids
    .filter((id) => !positions.has(id))
    .forEach((id, row) => positions.set(id, { x: 34, y: 34 + row * 116 }));
  const canvasWidth = Math.max(700, Math.max(stages.length, 1) * 250 + 68);
  const canvasHeight = Math.max(
    300,
    ...[...positions.values()].map(({ y }) => y + 92),
  );
  const dependencyEdges = ids.flatMap((target) =>
    (document.nodes[target].depends_on ?? []).map((source) => ({
      from: source,
      to: target,
      kind: "dependency",
    })),
  );
  const visibleEdges = [...dependencyEdges, ...(document.edges ?? [])];
  return (
    <section
      className="dependency-map panel"
      aria-label="Accessible graph dependency map"
    >
      <div className="panel-heading">
        <div>
          <p className="label">Workflow topology</p>
          <h3>Dependency map</h3>
          <p className="muted">
            Stages flow left to right. Select any node to open its inspector.
          </p>
        </div>
        <span className="status-badge">
          {ids.length} nodes · {visibleEdges.length} routes
        </span>
      </div>
      <div className="dependency-canvas-scroll">
        <div
          className="dependency-canvas"
          style={{ width: canvasWidth, height: canvasHeight }}
        >
          <svg aria-hidden="true" width={canvasWidth} height={canvasHeight}>
            {visibleEdges.map((edge, index) => {
              const start = positions.get(edge.from);
              const end = positions.get(edge.to);
              if (!start || !end) return null;
              const x1 = start.x + 184;
              const y1 = start.y + 34;
              const x2 = end.x;
              const y2 = end.y + 34;
              const bend = Math.max(30, (x2 - x1) / 2);
              return (
                <path
                  className={`dependency-edge ${edge.kind ?? "sequence"}`}
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  key={`${edge.from}-${edge.to}-${index}`}
                />
              );
            })}
          </svg>
          {ids.map((id) => {
            const node = document.nodes[id];
            const position = positions.get(id)!;
            return (
              <button
                style={{ left: position.x, top: position.y }}
                className={
                  selected === id ? "canvas-node active" : "canvas-node"
                }
                onClick={() => onSelect(id)}
                key={id}
                type="button"
              >
                <span>{node.type ?? "task"}</span>
                <strong>{node.title || id}</strong>
                <small>{id}</small>
              </button>
            );
          })}
        </div>
      </div>
      <details className="edge-editor">
        <summary>Edit explicit routes</summary>
        <fieldset>
          <legend>Add explicit edge</legend>
          <div className="form-grid three">
            <label>
              From
              <select
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              >
                {ids.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
            <label>
              Kind
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                <option>sequence</option>
                <option>conditional</option>
                <option>on_failure</option>
              </select>
            </label>
            <label>
              To
              <select
                value={to}
                onChange={(event) => setTo(event.target.value)}
              >
                {ids.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            </label>
          </div>
          {kind === "conditional" && (
            <label>
              Condition
              <input
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                placeholder="nodes.review.outputs.decision == 'ready'"
              />
            </label>
          )}
          <button
            onClick={() => {
              if (
                !from ||
                !to ||
                from === to ||
                (kind === "conditional" && !when.trim())
              )
                return;
              onChange({
                ...document,
                edges: [
                  ...(document.edges ?? []),
                  {
                    from,
                    to,
                    kind,
                    ...(kind === "conditional" ? { when: when.trim() } : {}),
                  },
                ],
              });
            }}
            type="button"
          >
            Add edge
          </button>
        </fieldset>
        {document.edges?.length ? (
          <table>
            <caption>Explicit edges</caption>
            <thead>
              <tr>
                <th>From</th>
                <th>Kind</th>
                <th>To</th>
                <th>Condition</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {document.edges.map((edge, index) => (
                <tr key={index}>
                  <td>{edge.from}</td>
                  <td>{edge.kind ?? "sequence"}</td>
                  <td>{edge.to}</td>
                  <td>{edge.when ?? "—"}</td>
                  <td>
                    <button
                      aria-label={`Remove edge ${edge.from} to ${edge.to}`}
                      onClick={() =>
                        onChange({
                          ...document,
                          edges: document.edges?.filter(
                            (_, item) => item !== index,
                          ),
                        })
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </details>
    </section>
  );
}
