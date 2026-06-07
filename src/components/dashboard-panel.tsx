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
import { CommandPanel, DataPanel, JsonPanel, StatusCard } from "./common";
import { minimumMagentVersion, recipePrompts } from "../lib/constants";
import type { ChatMessage, ChatSession, ConfigField, MemoryNode, ProjectInspection, Readiness, SetupMethod, SqliteDatabase, SystemInfo, TableData } from "../lib/types";
import { databaseValue, encodeFieldValue, extractRows, listFromUnknown, pretty, tableFromRows } from "../lib/utils";
import type { MagentCommandResult } from "../magent";

export function Dashboard(props: {
  busy: boolean;
  project: string;
  setProject: (project: string) => void;
  recentProjects: string[];
  pinnedProjects: string[];
  allProjects: string[];
  projectHealth: string;
  rememberProject: (project?: string) => void;
  togglePinnedProject: (project?: string) => void;
  chooseProjectFolder: () => void;
  system: SystemInfo | null;
  magentOk: boolean;
  readiness: Readiness | null;
  projectInspection: ProjectInspection | null;
  commandHistory: MagentCommandResult[];
  lastCommand: MagentCommandResult | null;
  onSystem: () => void;
  onReadiness: () => void;
  onInspectProject: () => void;
}) {
  const checks = props.readiness?.checks ?? [];
  return (
    <section className="content-grid">
      <div className="panel hero-panel">
        <div>
          <p className="label">Project Launcher</p>
          <h3>Open folders, pin daily projects, and check agent readiness.</h3>
          <p>Each folder keeps separate chat history while sharing the same MagAgent config, memory, plugin, and SQLite tools.</p>
        </div>
        <div className="project-input">
          <label htmlFor="project">Project path</label>
          <input id="project" value={props.project} onChange={(event) => props.setProject(event.target.value)} />
          <div className="row-actions">
            <button className="icon-action" onClick={() => props.rememberProject()} type="button">
              <Save size={17} />
              <span>Save</span>
            </button>
            <button className="icon-action" onClick={props.chooseProjectFolder} type="button">
              <FolderOpen size={17} />
              <span>Open</span>
            </button>
            <button className="icon-action" onClick={() => props.togglePinnedProject()} type="button">
              <CheckCircle2 size={17} />
              <span>{props.pinnedProjects.includes(props.project) ? "Unpin" : "Pin"}</span>
            </button>
          </div>
        </div>
      </div>

      <StatusCard
        title="MagAgent"
        icon={TerminalSquare}
        status={props.system?.magent_version ? `v${props.system.magent_version}` : "Not checked"}
        detail={props.system ? (props.magentOk ? "Desktop APIs ready" : `Upgrade to ${minimumMagentVersion}+`) : "Run detect"}
        action="Detect"
        onAction={props.onSystem}
      />
      <StatusCard
        title="Readiness"
        icon={ShieldCheck}
        status={props.projectHealth}
        detail={props.readiness?.provider ? `${props.readiness.provider} / ${props.readiness.model ?? "model"}` : "Run readiness"}
        action="Run"
        onAction={props.onReadiness}
      />
      <StatusCard title="Project" icon={Activity} status="Selected" detail={props.project} action="Remember" onAction={() => props.rememberProject()} />
      <StatusCard
        title="Git"
        icon={ClipboardList}
        status={props.projectInspection ? `${props.projectInspection.dirty_files} changed` : "Unknown"}
        detail={props.projectInspection?.recommended_next_action ?? "Inspect project health"}
        action="Inspect"
        onAction={props.onInspectProject}
      />
      <StatusCard
        title="Activity"
        icon={Workflow}
        status={`${props.commandHistory.length} commands`}
        detail={props.commandHistory[0]?.command ?? "No desktop commands yet"}
        action="Run"
        onAction={props.onReadiness}
      />

      <div className="panel">
        <div className="panel-heading">
          <h3>Project Health</h3>
          <Activity size={20} />
        </div>
        {props.projectInspection ? (
          <div className="health-grid">
            <div>
              <p className="label">Package</p>
              <strong>{props.projectInspection.package_manager ?? "unknown"}</strong>
            </div>
            <div>
              <p className="label">Languages</p>
              <strong>{props.projectInspection.languages.join(", ") || "unknown"}</strong>
            </div>
            <div>
              <p className="label">Frameworks</p>
              <strong>{props.projectInspection.frameworks.join(", ") || "unknown"}</strong>
            </div>
            <div>
              <p className="label">Tests</p>
              <span>{props.projectInspection.test_commands.join(" | ") || "not detected"}</span>
            </div>
          </div>
        ) : (
          <p className="muted">Inspect project health to detect git status, framework, package manager, languages, and likely test commands.</p>
        )}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h3>Pinned + Recent</h3>
          <FolderOpen size={20} />
        </div>
        <div className="stack">
          {props.allProjects.map((item) => (
            <button className="list-button" key={item} onClick={() => props.rememberProject(item)} type="button">
              <strong>{props.pinnedProjects.includes(item) ? "Pinned" : "Recent"}</strong>
              <span>{item}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <h3>Readiness Checks</h3>
          <CheckCircle2 size={20} />
        </div>
        <div className="check-list">
          {checks.length ? (
            checks.map((check) => (
              <div className={check.ok ? "check-row good" : "check-row bad"} key={check.key}>
                <span>{check.key}</span>
                <strong>{check.ok ? "OK" : "Review"}</strong>
              </div>
            ))
          ) : (
            <p className="muted">Run readiness to populate setup, provider, memory, and project checks.</p>
          )}
        </div>
      </div>

      <CommandPanel busy={props.busy} command={props.lastCommand} />
    </section>
  );
}
