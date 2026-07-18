import {
  Activity,
  Brain,
  CheckCircle2,
  ClipboardList,
  Database,
  FolderOpen,
  Gauge,
  KeyRound,
  MessageSquareText,
  Play,
  Plug,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wand2,
  Workflow,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";
import { CommandPanel, DataPanel, JsonPanel, StatusCard } from "./common";
import { minimumMagentVersion, recipePrompts } from "../lib/constants";
import type { ChatMessage, ChatSession, ConfigField, MemoryNode, ProjectInspection, Readiness, RunArtifact, RunCockpit, RunPermission, RunToolEvent, SetupMethod, SqliteDatabase, SystemInfo, TableData } from "../lib/types";
import { databaseValue, encodeFieldValue, extractRows, listFromUnknown, pretty, tableFromRows } from "../lib/utils";
import type { MagentCommandResult } from "../magent";

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
  streamLines: string[];
  response: Record<string, unknown> | null;
  events: Array<Record<string, unknown>>;
  history: ChatMessage[];
  quickPrompts: string[];
  project: string;
  allProjects: string[];
  onProjectSelect: (value: string) => void;
  onOpenProject: () => void;
  cockpit: RunCockpit;
  onRun: () => void;
  onClear: () => void;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!props.busy) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 500);
    return () => window.clearInterval(timer);
  }, [props.busy]);

  return (
    <section className="chat-workspace">
      <div className="panel chat-focus-panel">
        <div className="chat-topbar">
          <div>
            <p className="label">Agent Chat</p>
            <h3>{props.busy ? "MagAgent is working" : "Project Chat"}</h3>
          </div>
          <div className="chat-run-pill">
            {props.busy ? <span className="busy-dot" /> : <Sparkles size={18} />}
            <strong>{props.busy ? `Running ${formatDuration(elapsedMs)}` : props.cockpit.headline}</strong>
          </div>
        </div>

        <div className="chat-controls">
          <label htmlFor="chat-project">Project</label>
          <select id="chat-project" value={props.project} onChange={(event) => props.onProjectSelect(event.target.value)}>
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
          <button className="icon-action" onClick={props.onOpenProject} type="button">
            <FolderOpen size={16} />
            <span>Open</span>
          </button>
          <label htmlFor="chat-session">Session</label>
          <select id="chat-session" value={props.session} onChange={(event) => props.setSession(event.target.value)}>
            {props.sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
          <button className="icon-action" onClick={props.onNewSession} type="button">
            <MessageSquareText size={16} />
            <span>New</span>
          </button>
        </div>

        <LiveAgentStatus cockpit={props.cockpit} busy={props.busy} elapsedMs={elapsedMs} streamLines={props.streamLines} />

        <Transcript messages={props.history} busy={props.busy} cockpit={props.cockpit} streamLines={props.streamLines} elapsedMs={elapsedMs} />

        <div className="composer">
          <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} placeholder="Ask MagAgent to build, research, review, fix, or explain this project." />
          <div className="composer-actions">
            <button className="primary-action" onClick={props.onRun} disabled={props.busy} type="button">
              <MessageSquareText size={18} />
              <span>{props.busy ? "Running" : "Send"}</span>
            </button>
            <button className="icon-action" onClick={props.onClear} disabled={props.busy} type="button">
              <RefreshCcw size={16} />
              <span>Clear</span>
            </button>
            <details className="quick-prompt-drawer">
              <summary>Prompt ideas</summary>
              <div className="prompt-grid">
                {props.quickPrompts.map((prompt) => (
                  <button className="list-button compact" key={prompt} onClick={() => props.setPrompt(prompt)} type="button">
                    {prompt}
                  </button>
                ))}
              </div>
            </details>
            <details className="quick-prompt-drawer">
              <summary>Session tools</summary>
              <div className="session-tools">
                <input value={props.sessionDraftName} onChange={(event) => props.setSessionDraftName(event.target.value)} placeholder="Session name" />
                <button className="icon-action" onClick={props.onRenameSession} disabled={!props.sessionDraftName.trim()} type="button">
                  <Save size={16} />
                  <span>Rename</span>
                </button>
                <button className="icon-action" onClick={props.onDeleteSession} disabled={props.sessions.length < 2} type="button">
                  <XCircle size={16} />
                  <span>Delete</span>
                </button>
                <SessionBrowser sessions={props.sessions} active={props.session} onSelect={props.setSession} />
              </div>
            </details>
          </div>
        </div>
      </div>

      <details className="diagnostic-drawer">
        <summary>
          <span>Activity details</span>
          <strong>{props.cockpit.toolCount} tools · {props.cockpit.artifacts.length} artifacts · {props.cockpit.permissions.length} permissions</strong>
        </summary>
        <div className="diagnostic-stack">
          <RunCockpitPanel cockpit={props.cockpit} busy={props.busy} />
          <Timeline events={props.events} busy={props.busy} />
          <StreamPanel lines={props.streamLines} />
          <JsonPanel title="Response JSON" icon={<Search size={20} />} value={props.response} empty="Run a project ask to see JSON output." />
        </div>
      </details>
    </section>
  );
}

function LiveAgentStatus(props: { cockpit: RunCockpit; busy: boolean; elapsedMs: number; streamLines: string[] }) {
  const latestLine = props.streamLines.slice().reverse().find((line) => line.trim()) ?? "";
  const reversedTools = props.cockpit.tools.slice().reverse();
  const activeTool = reversedTools.find((tool) => tool.status === "running") ?? reversedTools[0];
  if (!props.busy && !props.cockpit.started) return null;
  return (
    <div className={props.busy ? "agent-status active" : "agent-status"}>
      <div>
        <p className="label">{props.busy ? "Live Activity" : "Last Run"}</p>
        <strong>{props.busy ? "Working in the selected project" : props.cockpit.headline}</strong>
        <p>{activeTool ? `${activeTool.name}${activeTool.detail ? `: ${activeTool.detail}` : ""}` : latestLine || "No tool activity recorded yet."}</p>
      </div>
      <div className="agent-status-metrics">
        <span>{props.busy ? formatDuration(props.elapsedMs) : formatDuration(props.cockpit.totalDurationMs) || "done"}</span>
        <span>{props.cockpit.toolCount} tools</span>
        <span>{props.cockpit.artifacts.length} files</span>
      </div>
    </div>
  );
}

function RunCockpitPanel(props: { cockpit: RunCockpit; busy: boolean }) {
  const duration = props.cockpit.totalDurationMs ? formatDuration(props.cockpit.totalDurationMs) : "n/a";
  const slowest = props.cockpit.slowestTool ? `${props.cockpit.slowestTool.name} ${formatDuration(props.cockpit.slowestTool.durationMs)}` : "n/a";
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>Run Cockpit</h3>
        {props.busy ? <span className="busy-dot" /> : <Gauge size={20} />}
      </div>
      <div className="cockpit-summary">
        <div>
          <p className="label">State</p>
          <strong>{props.cockpit.headline}</strong>
        </div>
        <div>
          <p className="label">Model Rounds</p>
          <strong>{props.cockpit.modelRounds}</strong>
        </div>
        <div>
          <p className="label">Tools</p>
          <strong>{props.cockpit.toolCount}</strong>
        </div>
        <div>
          <p className="label">Duration</p>
          <strong>{duration}</strong>
        </div>
        <div>
          <p className="label">Slowest</p>
          <strong>{slowest}</strong>
        </div>
        <div>
          <p className="label">Artifacts</p>
          <strong>{props.cockpit.artifacts.length}</strong>
        </div>
      </div>
      <div className="cockpit-grid">
        <ToolList tools={props.cockpit.tools} />
        <PermissionList permissions={props.cockpit.permissions} />
        <ArtifactList artifacts={props.cockpit.artifacts} />
      </div>
    </div>
  );
}

function ToolList(props: { tools: RunToolEvent[] }) {
  return (
    <div className="cockpit-card">
      <div className="mini-heading">
        <Wand2 size={16} />
        <strong>Tool Events</strong>
      </div>
      <div className="mini-list">
        {props.tools.length ? (
          props.tools.map((tool, index) => (
            <article className={`mini-item ${tool.status}`} key={`${tool.name}-${tool.path ?? tool.detail}-${index}`}>
              <strong>{tool.name}</strong>
              <span>{tool.status}{tool.durationMs ? ` in ${formatDuration(tool.durationMs)}` : ""}</span>
              {tool.detail && <p>{tool.detail}</p>}
            </article>
          ))
        ) : (
          <p className="muted">Tool calls and timings appear here during a run.</p>
        )}
      </div>
    </div>
  );
}

function PermissionList(props: { permissions: RunPermission[] }) {
  return (
    <div className="cockpit-card">
      <div className="mini-heading">
        <ShieldCheck size={16} />
        <strong>Permissions</strong>
      </div>
      <div className="mini-list">
        {props.permissions.length ? (
          props.permissions.map((permission, index) => (
            <article className={`mini-item ${permission.status}`} key={`${permission.command}-${index}`}>
              <strong>{permission.status}</strong>
              <span>{permission.command || "Permission event"}</span>
              {permission.detail && <p>{permission.detail}</p>}
            </article>
          ))
        ) : (
          <p className="muted">Permission requests and denials are separated from normal logs.</p>
        )}
      </div>
    </div>
  );
}

function ArtifactList(props: { artifacts: RunArtifact[] }) {
  return (
    <div className="cockpit-card">
      <div className="mini-heading">
        <ClipboardList size={16} />
        <strong>Artifacts</strong>
      </div>
      <div className="mini-list">
        {props.artifacts.length ? (
          props.artifacts.map((artifact) => (
            <article className="mini-item artifact" key={artifact.path}>
              <strong>{artifact.kind}</strong>
              <span>{artifact.path}</span>
              {artifact.detail && <p>{artifact.detail}</p>}
            </article>
          ))
        ) : (
          <p className="muted">Files, docs, diagrams, and images created by MagAgent appear here.</p>
        )}
      </div>
    </div>
  );
}

function SessionBrowser(props: { sessions: ChatSession[]; active: string; onSelect: (value: string) => void }) {
  return (
    <div className="session-browser">
      {props.sessions.map((session) => (
        <button className={props.active === session.id ? "list-button compact active-item" : "list-button compact"} key={session.id} onClick={() => props.onSelect(session.id)} type="button">
          <strong>{session.name}</strong>
          <span>{session.summary || `Updated ${new Date(session.updatedAt).toLocaleString()}`}</span>
        </button>
      ))}
    </div>
  );
}

function StreamPanel(props: { lines: string[] }) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>Live Stream</h3>
        <TerminalSquare size={20} />
      </div>
      <pre>{props.lines.length ? props.lines.join("\n") : "Streaming stdout/stderr appears here while commands run."}</pre>
    </div>
  );
}

function Transcript(props: { messages: ChatMessage[]; busy: boolean; cockpit: RunCockpit; streamLines: string[]; elapsedMs: number }) {
  return (
    <div className="transcript">
      {props.messages.length ? (
        <>
          {props.messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <p className="label">{message.role}</p>
              <p>{message.content}</p>
            </article>
          ))}
          <InlineActivity cockpit={props.cockpit} busy={props.busy} streamLines={props.streamLines} elapsedMs={props.elapsedMs} />
        </>
      ) : (
        <>
          <p className="muted">Chat history for this project will appear here.</p>
          <InlineActivity cockpit={props.cockpit} busy={props.busy} streamLines={props.streamLines} elapsedMs={props.elapsedMs} />
        </>
      )}
    </div>
  );
}

function InlineActivity(props: { cockpit: RunCockpit; busy: boolean; streamLines: string[]; elapsedMs: number }) {
  if (!props.busy && !props.cockpit.started) return null;
  const recentTools = props.cockpit.tools.slice(-5);
  const latestLine = props.streamLines.slice().reverse().find((line) => line.trim()) ?? "";
  const latestTool = recentTools.slice().reverse().find((tool) => tool.status === "running") ?? recentTools[recentTools.length - 1];
  return (
    <article className={props.busy ? "message agent activity-message active" : "message agent activity-message"}>
      <div className="activity-header">
        <div>
          <p className="label">{props.busy ? "working" : "activity"}</p>
          <strong>{props.busy ? `MagAgent is running ${formatDuration(props.elapsedMs)}` : props.cockpit.headline}</strong>
        </div>
        {props.busy && <span className="busy-dot" />}
      </div>
      <div className="activity-feed">
        {recentTools.length ? (
          recentTools.map((tool, index) => (
            <div className={`activity-row ${tool.status}`} key={`${tool.name}-${tool.path ?? tool.detail}-${index}`}>
              <span>{tool.status}</span>
              <strong>{tool.name}</strong>
              <p>{tool.detail || tool.path || (tool.durationMs ? `Finished in ${formatDuration(tool.durationMs)}` : "Running")}</p>
            </div>
          ))
        ) : (
          <div className="activity-row running">
            <span>start</span>
            <strong>Preparing</strong>
            <p>{latestLine || "Starting MagAgent and waiting for the first tool or response."}</p>
          </div>
        )}
      </div>
      <div className="activity-footer">
        <span>{props.cockpit.toolCount} tools</span>
        <span>{props.cockpit.artifacts.length} artifacts</span>
        <span>{props.cockpit.permissions.length} permissions</span>
        {latestTool?.durationMs && <span>last {formatDuration(latestTool.durationMs)}</span>}
      </div>
    </article>
  );
}

function Timeline(props: { events: Array<Record<string, unknown>>; busy: boolean }) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>Event Timeline</h3>
        {props.busy ? <span className="busy-dot" /> : <Activity size={20} />}
      </div>
      <div className="timeline">
        {props.events.length ? (
          props.events.map((event, index) => (
            <article className="timeline-item" key={`${event.type ?? "event"}-${index}`}>
              <strong>{String(event.type ?? "event")}</strong>
              <span>{pretty(event.command ?? event.path ?? event.ok ?? event.content ?? event.detail)}</span>
            </article>
          ))
        ) : (
          <p className="muted">Run chat with MagAgent 0.30+ to see structured events.</p>
        )}
      </div>
    </div>
  );
}

function formatDuration(value?: number) {
  if (!value && value !== 0) return "";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
}
