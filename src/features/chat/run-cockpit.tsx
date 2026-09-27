import { ClipboardList, Gauge, ShieldCheck, Wand2 } from "lucide-react";
import type {
  RunArtifact,
  RunCockpit,
  RunPermission,
  RunToolEvent,
} from "../../lib/types";
import { formatDuration } from "./chat-parts";

export function RunCockpitPanel(props: { cockpit: RunCockpit; busy: boolean }) {
  const duration = props.cockpit.totalDurationMs
    ? formatDuration(props.cockpit.totalDurationMs)
    : "n/a";
  const slowest = props.cockpit.slowestTool
    ? `${props.cockpit.slowestTool.name} ${formatDuration(props.cockpit.slowestTool.durationMs)}`
    : "n/a";
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

export function ToolList(props: { tools: RunToolEvent[] }) {
  return (
    <div className="cockpit-card">
      <div className="mini-heading">
        <Wand2 size={16} />
        <strong>Tool Events</strong>
      </div>
      <div className="mini-list">
        {props.tools.length ? (
          props.tools.map((tool, index) => (
            <article
              className={`mini-item ${tool.status}`}
              key={`${tool.name}-${tool.path ?? tool.detail}-${index}`}
            >
              <strong>{tool.name}</strong>
              <span>
                {tool.status}
                {tool.durationMs
                  ? ` in ${formatDuration(tool.durationMs)}`
                  : ""}
              </span>
              {tool.detail && <p>{tool.detail}</p>}
            </article>
          ))
        ) : (
          <p className="muted">
            Tool calls and timings appear here during a run.
          </p>
        )}
      </div>
    </div>
  );
}

export function PermissionList(props: { permissions: RunPermission[] }) {
  return (
    <div className="cockpit-card">
      <div className="mini-heading">
        <ShieldCheck size={16} />
        <strong>Permissions</strong>
      </div>
      <div className="mini-list">
        {props.permissions.length ? (
          props.permissions.map((permission, index) => (
            <article
              className={`mini-item ${permission.status}`}
              key={`${permission.command}-${index}`}
            >
              <strong>{permission.status}</strong>
              <span>{permission.command || "Permission event"}</span>
              {permission.detail && <p>{permission.detail}</p>}
            </article>
          ))
        ) : (
          <p className="muted">
            Permission requests and denials are separated from normal logs.
          </p>
        )}
      </div>
    </div>
  );
}

export function ArtifactList(props: { artifacts: RunArtifact[] }) {
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
          <p className="muted">
            Files, docs, diagrams, and images created by MagAgent appear here.
          </p>
        )}
      </div>
    </div>
  );
}
