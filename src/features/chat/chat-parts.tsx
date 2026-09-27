import { Activity, TerminalSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import type {
  AgentProfileSummary,
  ChatMessage,
  ChatSession,
  RunCockpit,
} from "../../lib/types";
import { pretty } from "../../lib/utils";

export function SessionBrowser(props: {
  sessions: ChatSession[];
  active: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="session-browser">
      {props.sessions.map((session) => (
        <button
          className={
            props.active === session.id
              ? "list-button compact active-item"
              : "list-button compact"
          }
          key={session.id}
          onClick={() => props.onSelect(session.id)}
          type="button"
        >
          <strong>{session.name}</strong>
          <span>
            {session.parentSessionId ? "↳ " : ""}
            {session.kind === "group" ? `${session.groupMode} group · ` : ""}
            {session.summary ||
              `Updated ${new Date(session.updatedAt).toLocaleString()}`}
          </span>
        </button>
      ))}
    </div>
  );
}

export function GroupConfigurator(props: {
  session?: ChatSession;
  profiles: AgentProfileSummary[];
  onChange: (
    participants: string[],
    mode: "sequential" | "parallel" | "coordinator",
    coordinator: string,
  ) => void;
}) {
  const participants = props.session?.participants || [];
  const mode = props.session?.groupMode || "sequential";
  const coordinator = props.session?.coordinator || participants[0] || "";
  const apply = (
    next: string[],
    nextMode = mode,
    nextCoordinator = coordinator,
  ) => props.onChange(next, nextMode, nextCoordinator);
  return (
    <div className="group-config">
      <label>
        Mode
        <select
          value={mode}
          onChange={(event) =>
            apply(participants, event.target.value as typeof mode, coordinator)
          }
        >
          <option value="sequential">Sequential handoff</option>
          <option value="parallel">Parallel specialists</option>
          <option value="coordinator">Coordinator synthesis</option>
        </select>
      </label>
      <fieldset>
        <legend>Participants · 2–5</legend>
        {props.profiles.map((profile) => (
          <label className="check-option" key={profile.name}>
            <input
              type="checkbox"
              checked={participants.includes(profile.name)}
              disabled={
                !participants.includes(profile.name) && participants.length >= 5
              }
              onChange={(event) =>
                apply(
                  event.target.checked
                    ? [...participants, profile.name]
                    : participants.filter((item) => item !== profile.name),
                )
              }
            />
            <span>
              {profile.name} · r{profile.revision}
            </span>
          </label>
        ))}
      </fieldset>
      {mode === "coordinator" && (
        <label>
          Coordinator
          <select
            value={coordinator}
            onChange={(event) => apply(participants, mode, event.target.value)}
          >
            {participants.map((profile) => (
              <option value={profile} key={profile}>
                {profile}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="field-help">
        Experimental. Each participant keeps its pinned OAP authority. Parallel
        approvals remain separate durable tasks.
      </p>
    </div>
  );
}

export function StreamPanel(props: { lines: string[] }) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>Live Stream</h3>
        <TerminalSquare size={20} />
      </div>
      <pre>
        {props.lines.length
          ? props.lines.join("\n")
          : "Streaming stdout/stderr appears here while commands run."}
      </pre>
    </div>
  );
}

export function Transcript(props: {
  messages: ChatMessage[];
  busy: boolean;
  cockpit: RunCockpit;
  streamLines: string[];
  elapsedMs: number;
  assistantDraft: string;
  progressUpdates: string[];
}) {
  const visible = props.messages.slice(-300);
  const container = useRef<HTMLDivElement>(null);
  const latestMessageId = visible[visible.length - 1]?.id;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [latestMessageId, props.cockpit.toolCount, props.streamLines.length]);
  return (
    <div className="transcript" ref={container} aria-live="polite">
      {props.messages.length ? (
        <>
          {visible.length < props.messages.length && (
            <p className="transcript-limit">
              {props.messages.length - visible.length} older messages remain
              persisted and are omitted from this render for responsiveness.
            </p>
          )}
          {visible.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <p className="label">{message.speaker || message.role}</p>
              <p>{message.content}</p>
            </article>
          ))}
          {props.busy && props.assistantDraft && (
            <article className="message agent assistant-draft-message">
              <p className="label">MagAgent · responding</p>
              <p>{props.assistantDraft}</p>
            </article>
          )}
          <InlineActivity
            cockpit={props.cockpit}
            busy={props.busy}
            streamLines={props.streamLines}
            elapsedMs={props.elapsedMs}
            progressUpdates={props.progressUpdates}
          />
        </>
      ) : (
        <>
          <p className="muted">
            Chat history for this project will appear here.
          </p>
          <InlineActivity
            cockpit={props.cockpit}
            busy={props.busy}
            streamLines={props.streamLines}
            elapsedMs={props.elapsedMs}
            progressUpdates={props.progressUpdates}
          />
        </>
      )}
    </div>
  );
}

export function InlineActivity(props: {
  cockpit: RunCockpit;
  busy: boolean;
  streamLines: string[];
  elapsedMs: number;
  progressUpdates: string[];
}) {
  if (!props.busy && !props.cockpit.started) return null;
  const recentTools = props.cockpit.tools.slice(-5);
  const latestLine =
    props.streamLines
      .slice()
      .reverse()
      .find((line) => line.trim()) ?? "";
  const latestTool =
    recentTools
      .slice()
      .reverse()
      .find((tool) => tool.status === "running") ??
    recentTools[recentTools.length - 1];
  return (
    <article
      className={
        props.busy
          ? "message agent activity-message active"
          : "message agent activity-message"
      }
      aria-label={props.busy ? "MagAgent live activity" : "Last run activity"}
    >
      <div className="activity-header">
        <div>
          <p className="label">{props.busy ? "working" : "activity"}</p>
          <strong>
            {props.busy
              ? `MagAgent is running ${formatDuration(props.elapsedMs)}`
              : props.cockpit.headline}
          </strong>
        </div>
        {props.busy && <span className="busy-dot" />}
      </div>
      <div className="activity-feed">
        {props.progressUpdates.length > 0 && (
          <div className="agent-progress" aria-label="Agent progress summaries">
            <strong>Progress</strong>
            <p>
              Concise activity summaries; private chain-of-thought is not
              exposed.
            </p>
            <ol>
              {props.progressUpdates.map((update, index) => (
                <li key={`${update}-${index}`}>{update}</li>
              ))}
            </ol>
          </div>
        )}
        {recentTools.length ? (
          recentTools.map((tool, index) => (
            <details
              className={`activity-row activity-tool ${tool.status}`}
              key={`${tool.name}-${tool.path ?? tool.detail}-${index}`}
            >
              <summary>
                <span>{tool.status}</span>
                <strong>{tool.name}</strong>
                <small>
                  {tool.durationMs
                    ? formatDuration(tool.durationMs)
                    : tool.status === "running"
                      ? "in progress"
                      : "details"}
                </small>
              </summary>
              <p>{tool.detail || tool.path || "No additional detail."}</p>
            </details>
          ))
        ) : (
          <div className="activity-row running">
            <span>start</span>
            <strong>Preparing</strong>
            <p>
              {latestLine ||
                "Starting MagAgent and waiting for the first tool or response."}
            </p>
          </div>
        )}
      </div>
      <div className="activity-footer">
        <span>{props.cockpit.toolCount} tools</span>
        <span>{props.cockpit.artifacts.length} artifacts</span>
        <span>{props.cockpit.permissions.length} permissions</span>
        {latestTool?.durationMs && (
          <span>last {formatDuration(latestTool.durationMs)}</span>
        )}
      </div>
    </article>
  );
}

export function Timeline(props: {
  events: Array<Record<string, unknown>>;
  busy: boolean;
}) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>Event Timeline</h3>
        {props.busy ? <span className="busy-dot" /> : <Activity size={20} />}
      </div>
      <div className="timeline">
        {props.events.length ? (
          props.events.map((event, index) => (
            <article
              className="timeline-item"
              key={`${event.type ?? "event"}-${index}`}
            >
              <strong>{String(event.type ?? "event")}</strong>
              <span>
                {pretty(
                  event.command ??
                    event.path ??
                    event.ok ??
                    event.content ??
                    event.detail,
                )}
              </span>
            </article>
          ))
        ) : (
          <p className="muted">
            Run chat to see MagAgent's durable task events in sequence.
          </p>
        )}
      </div>
    </div>
  );
}

export function formatDuration(value?: number) {
  if (!value && value !== 0) return "";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
}
