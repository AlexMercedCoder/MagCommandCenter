import { Play, Pause, RotateCcw, Square, XCircle } from "lucide-react";
import { terminalExecutionStates } from "../../lib/constants";
import type {
  ArtifactPreview,
  ExecutionEvent,
  ExecutionTask,
} from "../../lib/types";

export function TaskStrip(props: {
  tasks: ExecutionTask[];
  activeTask: ExecutionTask | null;
  events: ExecutionEvent[];
  error: string;
  recoveredTaskIds?: string[];
  onSelect: (taskId: string) => void;
  onAction: (
    taskId: string,
    action: "pause" | "resume" | "cancel" | "retry",
  ) => void;
  onPreviewArtifact: (path: string) => void;
}) {
  const recent = props.tasks.slice(0, 8);
  if (!recent.length && !props.error) return null;
  const task = props.activeTask;
  const recoveredTaskIds = props.recoveredTaskIds ?? [];
  return (
    <div className="task-strip" aria-label="Project tasks">
      {recoveredTaskIds.length > 0 && (
        <p className="muted" role="status">
          Reconnected to {recoveredTaskIds.length} unfinished task
          {recoveredTaskIds.length === 1 ? "" : "s"}. Review activity, then
          resume, retry, or cancel as needed.
        </p>
      )}
      <div className="task-tabs" role="list">
        {recent.map((item) => (
          <button
            className={item.id === task?.id ? "task-tab active" : "task-tab"}
            key={item.id}
            onClick={() => props.onSelect(item.id)}
            type="button"
            title={item.title}
          >
            <span className={`task-state ${item.state}`} />
            <span>{item.title}</span>
            <small>{item.state}</small>
          </button>
        ))}
      </div>
      {task && (
        <div className="task-controls">
          <span>{props.events.length} events</span>
          {task.state === "running" && (
            <button
              className="icon-button"
              onClick={() => props.onAction(task.id, "pause")}
              title="Pause task"
              type="button"
            >
              <Pause size={16} />
            </button>
          )}
          {(task.state === "waiting" || task.state === "blocked") && (
            <button
              className="icon-button"
              onClick={() => props.onAction(task.id, "resume")}
              title="Resume task"
              type="button"
            >
              <Play size={16} />
            </button>
          )}
          {!terminalExecutionStates.has(task.state) && (
            <button
              className="icon-button"
              onClick={() => props.onAction(task.id, "cancel")}
              title="Cancel task"
              type="button"
            >
              <Square size={16} />
            </button>
          )}
          {terminalExecutionStates.has(task.state) && (
            <button
              className="icon-button"
              onClick={() => props.onAction(task.id, "retry")}
              title="Retry task"
              type="button"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      )}
      {task?.files_changed.length ? (
        <div className="task-artifacts">
          {task.files_changed.slice(0, 12).map((path) => (
            <button
              className="artifact-chip"
              key={path}
              onClick={() => props.onPreviewArtifact(path)}
              type="button"
              title={path}
            >
              {path.split(/[\\/]/).pop()}
            </button>
          ))}
        </div>
      ) : null}
      {props.error && <p className="task-error">{props.error}</p>}
    </div>
  );
}

export function ArtifactViewer(props: {
  preview: ArtifactPreview;
  onClose: () => void;
}) {
  const fileName =
    props.preview.path.split(/[\\/]/).pop() ?? props.preview.path;
  return (
    <section
      className="artifact-viewer"
      aria-label={`Artifact preview: ${fileName}`}
    >
      <header>
        <div>
          <p className="label">Artifact preview</p>
          <strong>{fileName}</strong>
        </div>
        <span>
          {formatBytes(props.preview.bytes)}
          {props.preview.truncated ? " · truncated" : ""}
        </span>
        <button
          className="icon-button"
          onClick={props.onClose}
          title="Close artifact preview"
          type="button"
        >
          <XCircle size={17} />
        </button>
      </header>
      {props.preview.kind === "image" && props.preview.data_url && (
        <img alt={fileName} src={props.preview.data_url} />
      )}
      {(props.preview.kind === "html" || props.preview.kind === "svg") &&
        props.preview.text && (
          <iframe
            sandbox=""
            srcDoc={props.preview.text}
            title={`${fileName} rendered preview`}
          />
        )}
      {["markdown", "code", "text"].includes(props.preview.kind) && (
        <pre>{props.preview.text}</pre>
      )}
      {props.preview.kind === "binary" && (
        <p className="muted">
          This file type is verified but cannot be rendered safely in the inline
          preview.
        </p>
      )}
    </section>
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
