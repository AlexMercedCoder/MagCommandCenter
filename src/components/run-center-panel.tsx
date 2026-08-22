import { AlertCircle, CheckCircle2, Clock3, FileCode2, ListTodo, Pause, Play, RotateCcw, Square, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { activeExecutionStates, terminalExecutionStates } from "../lib/constants";
import type { ExecutionEvent, ExecutionTask } from "../lib/types";

type Filter = "attention" | "active" | "completed" | "all";

export function RunCenterPanel(props: {
  tasks: ExecutionTask[];
  activeTask: ExecutionTask | null;
  events: ExecutionEvent[];
  error: string;
  recoveredTaskIds: string[];
  onSelect: (id: string) => void;
  onAction: (id: string, action: "pause" | "resume" | "cancel" | "retry") => void;
  onPreviewArtifact: (path: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("attention");
  const attentionStates = new Set(["waiting", "awaiting_human", "blocked", "failed"]);
  const groups = useMemo(() => ({
    attention: props.tasks.filter((task) => attentionStates.has(task.state)),
    active: props.tasks.filter((task) => activeExecutionStates.has(task.state) && !attentionStates.has(task.state)),
    completed: props.tasks.filter((task) => terminalExecutionStates.has(task.state) && task.state !== "failed"),
    all: props.tasks
  }), [props.tasks]);
  const selected = props.activeTask ?? groups[filter][0] ?? null;

  return <section className="run-center">
    <div className="run-overview">
      <div><span className="run-metric-icon attention"><AlertCircle/></span><strong>{groups.attention.length}</strong><small>Need attention</small></div>
      <div><span className="run-metric-icon active"><Clock3/></span><strong>{groups.active.length}</strong><small>In progress</small></div>
      <div><span className="run-metric-icon complete"><CheckCircle2/></span><strong>{groups.completed.length}</strong><small>Completed</small></div>
    </div>
    {props.recoveredTaskIds.length > 0 && <div className="inline-notice"><RotateCcw/><span><strong>Recovered after restart</strong><small>{props.recoveredTaskIds.length} unfinished task{props.recoveredTaskIds.length === 1 ? "" : "s"} reconnected.</small></span></div>}
    <div className="run-layout">
      <section className="run-list-panel">
        <div className="run-tabs" role="tablist">{(["attention", "active", "completed", "all"] as Filter[]).map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item} type="button" key={item}>{item}<span>{groups[item].length}</span></button>)}</div>
        <div className="run-list">{groups[filter].length ? groups[filter].map((task) => <button className={selected?.id === task.id ? "run-row active" : "run-row"} onClick={() => props.onSelect(task.id)} type="button" key={task.id}><span className={`task-state ${task.state}`}/><span><strong>{task.title}</strong><small>{task.kind} · attempt {task.attempt}</small></span><span className="run-state-label">{task.state.replace(/_/g, " ")}</span></button>) : <div className="empty-state"><CheckCircle2/><strong>Nothing here</strong><p>This project has no {filter} runs.</p></div>}</div>
      </section>
      <RunInspector task={selected} events={props.events} onAction={props.onAction} onPreviewArtifact={props.onPreviewArtifact}/>
    </div>
    {props.error && <div className="inline-notice error"><XCircle/><span><strong>Runtime connection</strong><small>{props.error}</small></span></div>}
  </section>;
}

function RunInspector(props: { task: ExecutionTask | null; events: ExecutionEvent[]; onAction: (id: string, action: "pause" | "resume" | "cancel" | "retry") => void; onPreviewArtifact: (path: string) => void }) {
  const [drawer, setDrawer] = useState<"activity" | "context">("activity");
  if (!props.task) return <aside className="run-inspector"><div className="empty-state"><ListTodo/><strong>Select a run</strong><p>Its state, controls, evidence, and artifacts will appear here.</p></div></aside>;
  const task = props.task;
  return <aside className="run-inspector"><header><div><p className="eyebrow">{task.kind}</p><h2>{task.title}</h2><span className={`state-chip ${task.state}`}>{task.state.replace(/_/g, " ")}</span></div><div className="quiet-actions">{task.state === "running" && <button onClick={() => props.onAction(task.id, "pause")} type="button"><Pause/>Pause</button>}{["waiting", "blocked", "awaiting_human"].includes(task.state) && <button onClick={() => props.onAction(task.id, "resume")} type="button"><Play/>Resume</button>}{!terminalExecutionStates.has(task.state) && <button className="danger-quiet" onClick={() => props.onAction(task.id, "cancel")} type="button"><Square/>Cancel</button>}{terminalExecutionStates.has(task.state) && <button onClick={() => props.onAction(task.id, "retry")} type="button"><RotateCcw/>Retry</button>}</div></header>
    <div className="run-facts"><div><small>Attempt</small><strong>{task.attempt}</strong></div><div><small>Events</small><strong>{props.events.length}</strong></div><div><small>Tokens</small><strong>{String(task.usage.total_tokens ?? task.usage.tokens ?? 0)}</strong></div></div>
    {task.files_changed.length > 0 && <section className="artifact-section"><h3>Artifacts and files</h3><div>{task.files_changed.map((path) => <button onClick={() => props.onPreviewArtifact(path)} title={path} type="button" key={path}><FileCode2/><span>{path.split(/[\\/]/).pop()}</span></button>)}</div></section>}
    <div className="inspector-tabs"><button className={drawer === "activity" ? "active" : ""} onClick={() => setDrawer("activity")} type="button">Activity</button><button className={drawer === "context" ? "active" : ""} onClick={() => setDrawer("context")} type="button">Audit context</button></div>
    {drawer === "activity" ? <ol className="run-events">{props.events.slice(-100).reverse().map((event) => <li key={`${event.task_id}-${event.sequence}`}><span className={`task-state ${event.state}`}/><div><strong>{event.type.replace(/_/g, " ")}</strong><small>{event.created_at}</small>{Object.keys(event.detail).length > 0 && <p>{summarize(event.detail)}</p>}</div></li>)}</ol> : <pre className="context-code">{JSON.stringify({ usage: task.usage, checkpoints: task.checkpoints, final_audit: task.final_audit, metadata: task.metadata }, null, 2)}</pre>}
  </aside>;
}

function summarize(value: Record<string, unknown>) {
  return Object.entries(value).slice(0, 4).map(([key, item]) => `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`).join(" · ");
}
