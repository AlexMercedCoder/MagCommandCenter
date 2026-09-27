import { Bot, GitFork, RotateCcw } from "lucide-react";
import { memo } from "react";
import type {
  AgenticGraphDocument,
  AgenticGraphNode,
  ExecutionTask,
} from "../../../lib/types";
import { ordered } from "./utils";

const doneStates = new Set([
  "completed",
  "succeeded",
  "failed",
  "blocked",
  "cancelled",
  "skipped",
]);
export const todoStates = new Set(["queued", "ready", "waiting"]);
type KanbanLane = "todo" | "current" | "done";

export function taskLane(task?: ExecutionTask): KanbanLane {
  return !task || todoStates.has(task.state)
    ? "todo"
    : doneStates.has(task.state)
      ? "done"
      : "current";
}

export function GraphKanban(props: {
  document: AgenticGraphDocument;
  visible: Set<string>;
  selected: string;
  checked: Set<string>;
  tasks: Map<string, ExecutionTask>;
  presentationOrder: string[];
  onSelect: (id: string) => void;
  onCheck: (id: string) => void;
  onReorder: (id: string, delta: number) => void;
  onRetry?: (id: string) => void;
}) {
  const definitions: Array<{
    id: KanbanLane;
    title: string;
    description: string;
  }> = [
    {
      id: "todo",
      title: "To do",
      description: "Waiting for the run or dependencies",
    },
    {
      id: "current",
      title: "Current work",
      description: "Actively handled by the agent",
    },
    {
      id: "done",
      title: "Done",
      description: "Succeeded and failed jobs with summaries",
    },
  ];
  const ids = ordered(
    Object.keys(props.document.nodes),
    props.presentationOrder,
  ).filter((id) => props.visible.has(id));
  return (
    <div className="graph-board" aria-label="Agentic Graph execution Kanban">
      {definitions.map((lane) => {
        const laneIds = ids.filter(
          (id) => taskLane(props.tasks.get(id)) === lane.id,
        );
        return (
          <section
            className={`graph-stage kanban-lane ${lane.id}`}
            key={lane.id}
          >
            <header>
              <div>
                <span>{lane.title}</span>
                <small>{lane.description}</small>
              </div>
              <strong>{laneIds.length}</strong>
            </header>
            <div className="graph-card-list">
              {laneIds.map((id) => (
                <GraphCard
                  key={id}
                  id={id}
                  node={props.document.nodes[id]}
                  selected={props.selected === id}
                  checked={props.checked.has(id)}
                  task={props.tasks.get(id)}
                  onSelect={() => props.onSelect(id)}
                  onCheck={() => props.onCheck(id)}
                  onReorder={(delta) => props.onReorder(id, delta)}
                  onRetry={
                    props.onRetry ? () => props.onRetry?.(id) : undefined
                  }
                />
              ))}
              {laneIds.length === 0 && (
                <div className="kanban-empty">
                  {lane.id === "todo"
                    ? "No remaining work"
                    : lane.id === "current"
                      ? "The agent is not working a card"
                      : "Completed jobs will appear here"}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export const GraphCard = memo(function GraphCard({
  id,
  node,
  selected,
  checked,
  task,
  onSelect,
  onCheck,
  onReorder,
  onRetry,
}: {
  id: string;
  node: AgenticGraphNode;
  selected: boolean;
  checked: boolean;
  task?: ExecutionTask;
  onSelect: () => void;
  onCheck: () => void;
  onReorder: (delta: number) => void;
  onRetry?: () => void;
}) {
  const terminal = Boolean(task && doneStates.has(task.state));
  const succeeded = task?.state === "succeeded" || task?.state === "completed";
  return (
    <div className={`graph-card-wrap ${task?.state ?? "todo"}`}>
      <input
        aria-label={`Select ${id} for bulk edit`}
        type="checkbox"
        checked={checked}
        onChange={onCheck}
      />
      <button
        className={selected ? "graph-card selected" : "graph-card"}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (!event.altKey) return;
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onReorder(-1);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onReorder(1);
          }
        }}
        title="Alt+Up/Down changes presentation order only"
        type="button"
      >
        <div className="graph-card-heading">
          <span className="graph-card-type">{node.type ?? "task"}</span>
          {task && (
            <span
              className={`node-run-state ${succeeded ? "success" : terminal ? "failure" : "active"}`}
            >
              {task.state}
            </span>
          )}
        </div>
        <strong>{node.title}</strong>
        <p>{node.description}</p>
        {node.depends_on?.length ? (
          <div className="card-dependencies">
            <small>Depends on</small>
            <span>{node.depends_on.join(", ")}</span>
          </div>
        ) : (
          <div className="card-dependencies entry">
            <small>Entry card · no dependencies</small>
          </div>
        )}
        {terminal && (
          <div className={`job-summary ${succeeded ? "success" : "failure"}`}>
            <strong>
              {succeeded ? "Job succeeded" : "Job did not succeed"}
            </strong>
            <span>{taskSummary(task!)}</span>
            {task!.files_changed.length > 0 && (
              <small>
                {task!.files_changed.length} file
                {task!.files_changed.length === 1 ? "" : "s"} changed
              </small>
            )}
          </div>
        )}
        {node.labels?.length ? (
          <div className="tag-row">
            {node.labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        ) : null}
        <div className="graph-card-footer">
          <span>
            <GitFork size={13} />
            {node.depends_on?.length ?? 0}
          </span>
          <span>
            <Bot size={13} />
            {node["x-magagent-profile"] || "run default"}
          </span>
          {task && !terminal && <span>attempt {task.attempt}</span>}
        </div>
      </button>
      {task &&
        ["failed", "blocked", "cancelled"].includes(task.state) &&
        onRetry && (
          <button className="card-retry" onClick={onRetry} type="button">
            <RotateCcw size={14} />
            Retry this job + dependents
          </button>
        )}
    </div>
  );
});

export function taskSummary(task: ExecutionTask) {
  const candidates = [
    task.final_audit.summary,
    task.final_audit.message,
    task.metadata.summary,
    task.metadata.result_summary,
    task.metadata.error,
  ];
  const value = candidates.find(
    (item) => typeof item === "string" && item.trim(),
  );
  if (typeof value === "string") return value;
  if (task.state === "succeeded" || task.state === "completed")
    return "The agent completed this job successfully.";
  if (task.state === "skipped")
    return "The job was skipped because its execution condition was not met.";
  if (task.state === "cancelled")
    return "The job was cancelled before it completed.";
  return "The job failed. Open execution details to review its audit evidence and error context.";
}
