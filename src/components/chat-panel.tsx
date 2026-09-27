import {
  Brain,
  FolderOpen,
  MessageSquareText,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  Square,
  XCircle,
  Paperclip,
  Users,
  GitFork,
  Download,
} from "lucide-react";
import { useEffect, useState } from "react";
import { JsonPanel } from "./common";
import {
  activeExecutionStates,
  terminalExecutionStates,
} from "../lib/constants";
import type {
  AgentProfileSummary,
  ArtifactPreview,
  ChatMessage,
  ChatSession,
  ExecutionEvent,
  ExecutionTask,
  RunCockpit,
  WorkspaceFile,
} from "../lib/types";
import { ExperimentalBadge } from "./experimental-badge";
import { ArtifactViewer, TaskStrip } from "../features/chat/task-strip";
import { RunCockpitPanel } from "../features/chat/run-cockpit";
import {
  GroupConfigurator,
  SessionBrowser,
  StreamPanel,
  Timeline,
  Transcript,
  formatDuration,
} from "../features/chat/chat-parts";
import { evidenceFromAsk } from "../lib/memory-evidence";
import { MemoryUsedPanel } from "../features/memory/memory-used-panel";

/** " · 3 memories" for the activity summary, from the ask result's evidence. */
function memoryRecap(response: Record<string, unknown> | null) {
  const turns = evidenceFromAsk(response);
  if (!turns.length) return "";
  const ids = new Set(
    turns.flatMap((turn) => turn.nodes.map((node) => node.id)),
  );
  return ` · ${ids.size} ${ids.size === 1 ? "memory" : "memories"}`;
}

export { ArtifactViewer, TaskStrip };

export function ChatPanel(props: {
  busy: boolean;
  prompt: string;
  setPrompt: (value: string) => void;
  session: string;
  sessions: ChatSession[];
  setSession: (value: string) => void;
  sessionDraftName: string;
  setSessionDraftName: (value: string) => void;
  onNewSession: () => void;
  onRenameSession: () => void;
  onDeleteSession: () => void;
  onForkSession: () => void;
  onCompactSession: () => void;
  onExportSession: () => void;
  onConfigureGroup: (
    participants: string[],
    mode: "sequential" | "parallel" | "coordinator",
    coordinator: string,
  ) => void;
  onPermissionMode: (mode: "paranoid" | "balanced" | "silent" | "yolo") => void;
  profiles: AgentProfileSummary[];
  agentProfile: string;
  profileDrifted: boolean;
  onAgentProfileChange: (value: string) => void;
  streamLines: string[];
  response: Record<string, unknown> | null;
  events: Array<Record<string, unknown>>;
  history: ChatMessage[];
  assistantDraft: string;
  progressUpdates: string[];
  quickPrompts: string[];
  project: string;
  allProjects: string[];
  onProjectSelect: (value: string) => void;
  onOpenProject: () => void;
  cockpit: RunCockpit;
  tasks: ExecutionTask[];
  activeTask: ExecutionTask | null;
  taskEvents: ExecutionEvent[];
  taskError: string;
  recoveredTaskIds?: string[];
  artifactPreview: ArtifactPreview | null;
  onPreviewArtifact: (path: string) => void;
  onCloseArtifact: () => void;
  onSelectTask: (taskId: string) => void;
  onTaskAction: (
    taskId: string,
    action: "pause" | "resume" | "cancel" | "retry",
  ) => void;
  onRun: () => void;
  onCreateOrchestratedGoal: () => void;
  onClear: () => void;
  contextFiles: WorkspaceFile[];
  onRemoveContext: (path: string) => void;
  onOpenWorkspace: () => void;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const activeSession = props.sessions.find(
    (item) => item.id === props.session,
  );
  const runningTask =
    (props.activeTask && activeExecutionStates.has(props.activeTask.state)
      ? props.activeTask
      : null) ??
    props.tasks.find((task) => activeExecutionStates.has(task.state)) ??
    null;

  useEffect(() => {
    if (!props.busy) {
      setElapsedMs(0);
      return;
    }
    const persistedStart = Date.parse(
      runningTask?.started_at || runningTask?.created_at || "",
    );
    const startedAt = Number.isFinite(persistedStart)
      ? persistedStart
      : Date.now();
    setElapsedMs(Math.max(0, Date.now() - startedAt));
    const timer = window.setInterval(
      () => setElapsedMs(Math.max(0, Date.now() - startedAt)),
      500,
    );
    return () => window.clearInterval(timer);
  }, [
    props.busy,
    runningTask?.id,
    runningTask?.started_at,
    runningTask?.created_at,
  ]);

  return (
    <section className="chat-workspace">
      <div className="panel chat-focus-panel">
        <div className="chat-topbar">
          <div>
            <p className="label">Agent Chat</p>
            <h3>{props.busy ? "MagAgent is working" : "Project Chat"}</h3>
          </div>
          <div className="chat-run-pill">
            {props.busy ? (
              <span className="busy-dot" />
            ) : (
              <Sparkles size={18} />
            )}
            <strong>
              {props.busy
                ? `Running ${formatDuration(elapsedMs)}`
                : props.cockpit.headline}
            </strong>
          </div>
        </div>

        <div className="chat-controls">
          <div className="chat-control-field project-field">
            <label htmlFor="chat-project">Project</label>
            <select
              id="chat-project"
              value={props.project}
              onChange={(event) => props.onProjectSelect(event.target.value)}
            >
              {props.allProjects.length ? (
                props.allProjects.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))
              ) : (
                <option value={props.project}>{props.project}</option>
              )}
            </select>
          </div>
          <button
            className="icon-action"
            onClick={props.onOpenProject}
            type="button"
          >
            <FolderOpen size={16} />
            <span>Open</span>
          </button>
          <div className="chat-control-field">
            <label htmlFor="chat-session">Session</label>
            <select
              id="chat-session"
              value={props.session}
              onChange={(event) => props.setSession(event.target.value)}
            >
              {props.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="icon-action"
            onClick={props.onNewSession}
            type="button"
          >
            <MessageSquareText size={16} />
            <span>New</span>
          </button>
          <div className="chat-control-field">
            <label htmlFor="chat-agent">Agent</label>
            <select
              id="chat-agent"
              value={props.agentProfile}
              onChange={(event) =>
                props.onAgentProfileChange(event.target.value)
              }
            >
              {!props.profiles.some(
                (profile) => profile.name === props.agentProfile,
              ) && (
                <option value={props.agentProfile}>{props.agentProfile}</option>
              )}
              {props.profiles.map((profile) => (
                <option key={profile.name} value={profile.name}>
                  {profile.name} · r{profile.revision}
                </option>
              ))}
            </select>
          </div>
          <div className="chat-control-field">
            <label htmlFor="chat-permission">Permission mode</label>
            <select
              id="chat-permission"
              value={activeSession?.permissionMode || "balanced"}
              onChange={(event) =>
                props.onPermissionMode(
                  event.target.value as
                    "paranoid" | "balanced" | "silent" | "yolo",
                )
              }
            >
              <option value="paranoid">Supervised</option>
              <option value="balanced">Balanced</option>
              <option value="silent">Auto-accept safe work</option>
              <option value="yolo">Full access</option>
            </select>
          </div>
        </div>

        {props.profileDrifted && (
          <div className="profile-drift" role="status">
            <ShieldCheck size={18} />
            <span>This agent changed since the session was pinned.</span>
            <button
              className="icon-action"
              onClick={() => props.onAgentProfileChange(props.agentProfile)}
              type="button"
            >
              Use latest revision
            </button>
          </div>
        )}

        <TaskStrip
          tasks={props.tasks}
          activeTask={props.activeTask}
          events={props.taskEvents}
          error={props.taskError}
          recoveredTaskIds={props.recoveredTaskIds}
          onSelect={props.onSelectTask}
          onAction={props.onTaskAction}
          onPreviewArtifact={props.onPreviewArtifact}
        />

        {props.artifactPreview && (
          <ArtifactViewer
            preview={props.artifactPreview}
            onClose={props.onCloseArtifact}
          />
        )}

        <Transcript
          messages={props.history}
          busy={props.busy}
          cockpit={props.cockpit}
          streamLines={props.streamLines}
          elapsedMs={elapsedMs}
          assistantDraft={props.assistantDraft}
          progressUpdates={props.progressUpdates}
        />

        <div className="composer">
          {props.contextFiles.length > 0 && (
            <div
              className="context-chips"
              aria-label="Attached workspace context"
            >
              {props.contextFiles.map((file) => (
                <span key={file.path}>
                  <Paperclip />
                  {file.name}
                  <button
                    onClick={() => props.onRemoveContext(file.path)}
                    aria-label={`Remove ${file.name}`}
                    type="button"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            aria-label="Message MagAgent"
            value={props.prompt}
            onChange={(event) => props.setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (
                (event.metaKey || event.ctrlKey) &&
                event.key === "Enter" &&
                !props.busy &&
                props.prompt.trim()
              ) {
                event.preventDefault();
                props.onRun();
              }
            }}
            placeholder="Ask MagAgent to build, research, review, fix, or explain this project. Use Ctrl/Command+Enter to send."
          />
          <div className="composer-actions">
            <button
              className="icon-action"
              onClick={props.onOpenWorkspace}
              type="button"
            >
              <Paperclip size={16} />
              <span>
                Context
                {props.contextFiles.length
                  ? ` (${props.contextFiles.length})`
                  : ""}
              </span>
            </button>
            {props.busy ? (
              <button
                className="danger-action chat-stop-action"
                onClick={() =>
                  runningTask && props.onTaskAction(runningTask.id, "cancel")
                }
                disabled={
                  !runningTask || terminalExecutionStates.has(runningTask.state)
                }
                type="button"
              >
                <Square size={16} />
                <span>{runningTask ? "Stop" : "Starting…"}</span>
              </button>
            ) : (
              <button
                className="primary-action"
                onClick={props.onRun}
                disabled={!props.prompt.trim()}
                type="button"
              >
                <MessageSquareText size={18} />
                <span>Send</span>
              </button>
            )}
            <button
              className="icon-action"
              onClick={props.onCreateOrchestratedGoal}
              disabled={props.busy || !props.prompt.trim()}
              type="button"
            >
              <Workflow size={16} />
              <span>Stage Goal</span>
            </button>
            <button
              className="icon-action"
              onClick={props.onClear}
              disabled={props.busy}
              type="button"
            >
              <RefreshCcw size={16} />
              <span>Clear</span>
            </button>
            <details className="quick-prompt-drawer">
              <summary>Prompt ideas</summary>
              <div className="prompt-grid">
                {props.quickPrompts.map((prompt) => (
                  <button
                    className="list-button compact"
                    key={prompt}
                    onClick={() => props.setPrompt(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </details>
            <details className="quick-prompt-drawer">
              <summary>Session tools</summary>
              <div className="session-tools">
                <input
                  value={props.sessionDraftName}
                  onChange={(event) =>
                    props.setSessionDraftName(event.target.value)
                  }
                  placeholder="Session name"
                />
                <button
                  className="icon-action"
                  onClick={props.onRenameSession}
                  disabled={!props.sessionDraftName.trim()}
                  type="button"
                >
                  <Save size={16} />
                  <span>Rename</span>
                </button>
                <button
                  className="icon-action"
                  onClick={props.onDeleteSession}
                  disabled={props.sessions.length < 2}
                  type="button"
                >
                  <XCircle size={16} />
                  <span>Delete</span>
                </button>
                <button
                  className="icon-action"
                  onClick={props.onForkSession}
                  type="button"
                >
                  <GitFork size={16} />
                  <span>Fork</span>
                </button>
                <button
                  className="icon-action"
                  onClick={props.onCompactSession}
                  type="button"
                >
                  <Brain size={16} />
                  <span>Compact</span>
                </button>
                <button
                  className="icon-action"
                  onClick={props.onExportSession}
                  type="button"
                >
                  <Download size={16} />
                  <span>Export</span>
                </button>
                <SessionBrowser
                  sessions={props.sessions}
                  active={props.session}
                  onSelect={props.setSession}
                />
              </div>
            </details>
            <details className="quick-prompt-drawer group-drawer">
              <summary>
                <Users size={14} /> Group <ExperimentalBadge />
              </summary>
              <GroupConfigurator
                session={activeSession}
                profiles={props.profiles}
                onChange={props.onConfigureGroup}
              />
            </details>
          </div>
        </div>
      </div>

      <details className="diagnostic-drawer">
        <summary>
          <span>Activity details</span>
          <strong>
            {props.cockpit.toolCount} tools · {props.cockpit.artifacts.length}{" "}
            artifacts · {props.cockpit.permissions.length} permissions
            {memoryRecap(props.response)}
          </strong>
        </summary>
        <div className="diagnostic-stack">
          <RunCockpitPanel cockpit={props.cockpit} busy={props.busy} />
          {typeof props.response?.execution_task_id === "string" &&
            evidenceFromAsk(props.response).length > 0 && (
              <div className="panel">
                <div className="panel-heading">
                  <h3>Memory used</h3>
                </div>
                <MemoryUsedPanel taskId={props.response.execution_task_id} />
              </div>
            )}
          <Timeline events={props.events} busy={props.busy} />
          <StreamPanel lines={props.streamLines} />
          <JsonPanel
            title="Response JSON"
            icon={<Search size={20} />}
            value={props.response}
            empty="Run a project ask to see JSON output."
          />
        </div>
      </details>
    </section>
  );
}
