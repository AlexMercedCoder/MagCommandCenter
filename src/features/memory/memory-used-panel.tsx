import { Brain } from "lucide-react";
import { useEffect, useState } from "react";
import {
  loadMemoryEvidence,
  peakBudgetShare,
  statusLabels,
  type EvidenceResult,
  type EvidenceTurn,
} from "../../lib/memory-evidence";
import { useAppStore } from "../../stores/app-store";
import { loadMemoryNode, useMemoryStore } from "./memory-store";

function openNode(id: string) {
  useMemoryStore.getState().set({ selectedNodeId: id });
  useAppStore.getState().set({ view: "memory" });
  void loadMemoryNode(id);
}

function Turn(props: { turn: EvidenceTurn }) {
  const { turn } = props;
  const share =
    turn.tokens.budget > 0
      ? Math.min(
          100,
          Math.round((turn.tokens.injected / turn.tokens.budget) * 100),
        )
      : 0;
  return (
    <li className={`memory-turn status-${turn.status}`}>
      <div className="memory-turn-heading">
        <strong>Turn {turn.turn}</strong>
        <span>{statusLabels[turn.status] ?? turn.status}</span>
      </div>
      {turn.query_preview && (
        <p className="memory-query" title={turn.query_preview}>
          “{turn.query_preview}”
        </p>
      )}
      {turn.status === "used" && (
        <>
          <div
            className="memory-budget"
            role="meter"
            aria-label={`Memory used ${turn.tokens.injected} of ${turn.tokens.budget} tokens`}
            aria-valuemin={0}
            aria-valuemax={turn.tokens.budget}
            aria-valuenow={turn.tokens.injected}
          >
            <span style={{ width: `${share}%` }} />
          </div>
          <small>
            {turn.tokens.injected.toLocaleString()} of{" "}
            {turn.tokens.budget.toLocaleString()} tokens injected
            {turn.truncated
              ? ` · trimmed (${(turn.truncation ?? []).join(", ").replace(/_/g, " ") || "budget"})`
              : ""}
          </small>
          <ul className="memory-nodes">
            {turn.nodes.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => openNode(node.id)}
                  title="Open this memory"
                >
                  {node.id}
                </button>
                {node.type && (
                  <span className="memory-node-type">{node.type}</span>
                )}
                {typeof node.score === "number" && (
                  <span className="memory-node-score">
                    score {node.score.toFixed(2)}
                  </span>
                )}
                {node.reason && <small>{node.reason}</small>}
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

/** What MagAgent recalled from memory for one run (G-3 evidence). */
export function MemoryUsedPanel(props: { taskId: string }) {
  const [result, setResult] = useState<EvidenceResult | null>(null);
  useEffect(() => {
    let current = true;
    setResult(null);
    void loadMemoryEvidence(props.taskId)
      .then((value) => {
        if (current) setResult(value);
      })
      .catch((reason: unknown) => {
        if (current)
          setResult({
            ok: false,
            error: reason instanceof Error ? reason.message : String(reason),
          });
      });
    return () => {
      current = false;
    };
  }, [props.taskId]);

  if (!result)
    return (
      <p className="memory-used-state" role="status">
        Loading memory evidence…
      </p>
    );
  if (!result.ok)
    return (
      <div className="memory-used-state">
        <Brain aria-hidden="true" />
        <div>
          <strong>No memory evidence for this run</strong>
          <p>{result.error}</p>
          {result.hint && <small>{result.hint}</small>}
        </div>
      </div>
    );
  const { summary } = result;
  return (
    <section className="memory-used" aria-label="Memory used">
      <dl className="memory-used-summary">
        <div>
          <dt>Turns with memory</dt>
          <dd>
            {summary.turns_with_memory} of {summary.turns}
          </dd>
        </div>
        <div>
          <dt>Memories recalled</dt>
          <dd>{summary.unique_nodes.length}</dd>
        </div>
        <div>
          <dt>Tokens injected</dt>
          <dd>{summary.tokens_injected.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Peak budget use</dt>
          <dd>{peakBudgetShare(result)}%</dd>
        </div>
      </dl>
      {summary.truncated && (
        <p className="field-help">
          Some recalled memory was trimmed to fit the budget. Raise the memory
          budget in the agent profile if answers miss context.
        </p>
      )}
      <ol className="memory-turns">
        {result.turns.map((turn) => (
          <Turn turn={turn} key={turn.turn} />
        ))}
      </ol>
    </section>
  );
}
