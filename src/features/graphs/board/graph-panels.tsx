import { Check, Pause, Play, RotateCcw, Sparkles, Square } from "lucide-react";
import { sourceDiff } from "../graph-model";
import type {
  AgenticGraphDocument,
  AgentProfileSummary,
  ExecutionTask,
  GraphAuthoringContract,
} from "../../../lib/types";
import { toggleSet, activeStates, type Proposal } from "./utils";

export function SourcePanel({
  format,
  document,
  baseline,
  text,
  setText,
  error,
  onReset,
  onApply,
}: {
  format: "yaml" | "json";
  document: AgenticGraphDocument;
  baseline: AgenticGraphDocument | null;
  text: string;
  setText: (value: string) => void;
  error: string;
  onReset: () => void;
  onApply: () => void;
}) {
  const diff = sourceDiff(baseline, document);
  return (
    <section className="source-workspace">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="label">Advanced · {format.toUpperCase()}</p>
            <h3>Synchronized portable source</h3>
          </div>
          <div className="row-actions">
            <button onClick={onReset} type="button">
              <RotateCcw />
              Reset
            </button>
            <button onClick={onApply} type="button">
              <Check />
              Apply source
            </button>
          </div>
        </div>
        <textarea
          className="source-editor"
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
        />
        {error && <p className="warning-text">{error}</p>}
      </div>
      <div className="panel">
        <h3>Structured diff from disk</h3>
        <pre className="source-diff">
          {diff.length ? diff.slice(0, 1000).join("\n") : "No source changes."}
        </pre>
      </div>
    </section>
  );
}

export function BulkBar({
  count,
  profiles,
  onProfile,
  onLabel,
  onClear,
}: {
  count: number;
  profiles: AgentProfileSummary[];
  onProfile: (value: string) => void;
  onLabel: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="bulk-bar panel">
      <strong>{count} selected</strong>
      <select
        defaultValue=""
        onChange={(event) => onProfile(event.target.value)}
      >
        <option value="">Set run default profile</option>
        {profiles.map((profile) => (
          <option key={profile.name}>{profile.name}</option>
        ))}
      </select>
      <input id="bulk-label" placeholder="Add label" />
      <button
        onClick={() =>
          onLabel(
            (document.getElementById("bulk-label") as HTMLInputElement).value,
          )
        }
        type="button"
      >
        Apply label
      </button>
      <button onClick={onClear} type="button">
        Clear
      </button>
    </div>
  );
}

export function AssistantPanel(props: {
  prompt: string;
  setPrompt: (value: string) => void;
  busy: boolean;
  onPropose: () => void;
  proposal: Proposal | null;
  selection: Set<number>;
  setSelection: (value: Set<number>) => void;
  onApply: () => void;
  onReject: () => void;
}) {
  return (
    <section className="panel graph-assistant">
      <div className="panel-heading">
        <div>
          <p className="label">Agent-assisted design</p>
          <h3>Propose a reviewable graph patch</h3>
        </div>
        <Sparkles />
      </div>
      <div className="input-action">
        <input
          value={props.prompt}
          onChange={(event) => props.setPrompt(event.target.value)}
          placeholder="Add verification, reduce cost, increase parallelism, or add a human approval…"
        />
        <button
          onClick={props.onPropose}
          disabled={props.busy || !props.prompt.trim()}
          type="button"
        >
          Propose
        </button>
      </div>
      {props.proposal && (
        <div className="proposal-review">
          <p>
            <strong>{props.proposal.model}</strong> via {props.proposal.profile}
          </p>
          {props.proposal.changes.map((change, index) => (
            <label className="proposal-change" key={index}>
              <input
                type="checkbox"
                checked={props.selection.has(index)}
                onChange={() =>
                  props.setSelection(toggleSet(props.selection, index))
                }
              />
              <span>
                <strong>
                  {change.operation} {change.pointer}
                </strong>
                <small>{change.explanation}</small>
              </span>
            </label>
          ))}
          <div className="row-actions">
            <button onClick={props.onReject} type="button">
              Reject all
            </button>
            <button
              className="primary-action"
              onClick={props.onApply}
              disabled={!props.selection.size}
              type="button"
            >
              Accept selected
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function TemplateGallery({
  busy,
  contributed,
  onUse,
  onDocument,
}: {
  busy: boolean;
  contributed: GraphAuthoringContract["graph_templates"];
  onUse: (goal: string, model: boolean) => void;
  onDocument: (document: AgenticGraphDocument) => void;
}) {
  const templates = [
    [
      "Release prep",
      "Prepare a release: inspect readiness, run verification in parallel where safe, review evidence, and gate publishing.",
    ],
    [
      "Bug triage",
      "Triage a reported defect, reproduce it, identify the root cause, implement a fix, and verify regression coverage.",
    ],
    [
      "Docs audit",
      "Audit project documentation for drift and gaps, update the highest-impact pages, and verify links and examples.",
    ],
    [
      "Dependency upgrade",
      "Inspect an outdated dependency, plan a compatible upgrade, implement it, and run focused verification.",
    ],
    [
      "Test repair",
      "Inspect failing tests, isolate root causes, repair behavior without weakening assertions, and verify the suite.",
    ],
  ] as const;
  return (
    <details className="panel template-gallery">
      <summary>Workflow template gallery</summary>
      <div className="template-grid">
        {templates.map(([title, goal]) => (
          <div className="template-option" key={title}>
            <strong>{title}</strong>
            <span>{goal}</span>
            <div className="row-actions">
              <button
                disabled={busy}
                onClick={() => onUse(goal, false)}
                type="button"
              >
                Deterministic
              </button>
              <button
                disabled={busy}
                onClick={() => onUse(goal, true)}
                type="button"
              >
                Planning model
              </button>
            </div>
          </div>
        ))}
        {contributed.map((template) => (
          <div className="template-option" key={template.id}>
            <strong>{template.title}</strong>
            <span>{template.description}</span>
            <small>
              {template.plugin} · {template.trust} ·{" "}
              {template.digest.slice(0, 18)}…
            </small>
            <button
              disabled={busy}
              onClick={() => onDocument(template.document)}
              type="button"
            >
              Use trusted plugin template
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

export function RunReview({
  plan,
  gates,
  approved,
  setApproved,
}: {
  plan: Record<string, unknown>;
  gates: string[];
  approved: Set<string>;
  setApproved: (value: Set<string>) => void;
}) {
  return (
    <section className="panel run-review">
      <h3>Execution review</h3>
      <div className="form-grid three">
        <span>
          <small>Projected cost</small>
          <strong>${Number(plan.projected_cost_usd ?? 0).toFixed(2)}</strong>
        </span>
        <span>
          <small>Execution bound</small>
          <strong>{String(plan.worst_case_node_executions ?? "—")}</strong>
        </span>
        <span>
          <small>Parallel limit</small>
          <strong>{String(plan.max_parallel_nodes ?? "—")}</strong>
        </span>
      </div>
      {gates.length ? (
        <fieldset>
          <legend>Human gates</legend>
          {gates.map((gate) => (
            <label className="check-option" key={gate}>
              <input
                type="checkbox"
                checked={approved.has(gate)}
                onChange={() => setApproved(toggleSet(approved, gate))}
              />
              <span>
                <strong>{gate}</strong>
                <small>
                  Approve only this declared checkpoint for the reviewed graph
                  digest.
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="muted">No human gates are declared.</p>
      )}
    </section>
  );
}

export function ExecutionCockpit({
  root,
  children,
  activity,
  onAction,
}: {
  root: ExecutionTask;
  children: ExecutionTask[];
  activity: string[];
  onAction: (action: "pause" | "resume" | "cancel" | "retry") => void;
}) {
  return (
    <section className="panel execution-cockpit">
      <div className="panel-heading">
        <div>
          <p className="label">Durable graph execution</p>
          <h3>{root.title}</h3>
          <span
            className={`status-badge ${root.state === "succeeded" ? "good" : activeStates.has(root.state) ? "warning" : ""}`}
          >
            {root.state}
          </span>
        </div>
        <div className="row-actions">
          {root.state === "running" && (
            <button onClick={() => onAction("pause")} type="button">
              <Pause />
              Pause
            </button>
          )}
          {["waiting", "blocked", "awaiting_human"].includes(root.state) && (
            <button onClick={() => onAction("resume")} type="button">
              <Play />
              Resume
            </button>
          )}
          {activeStates.has(root.state) && (
            <button onClick={() => onAction("cancel")} type="button">
              <Square />
              Cancel
            </button>
          )}
          {["failed", "cancelled"].includes(root.state) && (
            <button onClick={() => onAction("retry")} type="button">
              <RotateCcw />
              Retry
            </button>
          )}
        </div>
      </div>
      <div className="execution-node-list">
        {children.map((task) => (
          <details key={task.id}>
            <summary>
              <strong>{String(task.metadata.node_id ?? task.title)}</strong>
              <span>{task.state}</span>
              <small>
                attempt {task.attempt} ·{" "}
                {String(task.usage.total_tokens ?? task.usage.tokens ?? 0)}{" "}
                tokens
              </small>
            </summary>
            {task.files_changed.length ? (
              <p>Files: {task.files_changed.join(", ")}</p>
            ) : null}
            <pre>
              {JSON.stringify(
                {
                  usage: task.usage,
                  audit: task.final_audit,
                  metadata: task.metadata,
                },
                null,
                2,
              )}
            </pre>
          </details>
        ))}
      </div>
      {activity.length > 0 && (
        <details className="activity-disclosure">
          <summary>Bounded live log ({activity.length})</summary>
          <pre className="code-preview" aria-live="polite">
            {activity.join("\n")}
          </pre>
        </details>
      )}
    </section>
  );
}
