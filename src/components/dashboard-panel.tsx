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
import type { CacheReadiness, ChatMessage, ChatSession, ConfigField, EcosystemReadiness, MemoryNode, ProjectInspection, ProviderDetection, Readiness, SetupMethod, SqliteDatabase, SystemInfo, TableData, ToolReadiness } from "../lib/types";
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
  ecosystemReadiness: EcosystemReadiness | null;
  toolReadiness: ToolReadiness | null;
  providerDetection: ProviderDetection | null;
  cacheReadiness: CacheReadiness | null;
  projectInspection: ProjectInspection | null;
  commandHistory: MagentCommandResult[];
  lastCommand: MagentCommandResult | null;
  onSystem: () => void;
  onReadiness: () => void;
  onEcosystemReadiness: () => void;
  onEnvironment: () => void;
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

      <EnvironmentCenter
        busy={props.busy}
        system={props.system}
        tools={props.toolReadiness}
        providers={props.providerDetection}
        cache={props.cacheReadiness}
        onRefresh={props.onEnvironment}
      />
      <StatusCard
        title="Ecosystem"
        icon={Workflow}
        status={props.ecosystemReadiness ? (props.ecosystemReadiness.ok ? "Local checks pass" : "Review") : "Not checked"}
        detail={props.ecosystemReadiness ? `${props.ecosystemReadiness.external_gates?.length ?? 0} external release gates` : "Generate cross-project evidence"}
        action="Check"
        onAction={props.onEcosystemReadiness}
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
          <h3>Ecosystem Readiness</h3>
          <Workflow size={20} />
        </div>
        {props.ecosystemReadiness ? (
          <div className="stack">
            <div className="check-list">
              {(props.ecosystemReadiness.checks ?? []).map((check) => (
                <div className={check.ok ? "check-row good" : "check-row bad"} key={check.name}>
                  <span>{check.name}</span>
                  <strong>{check.status}</strong>
                </div>
              ))}
            </div>
            <details>
              <summary>External release gates</summary>
              <ul>{(props.ecosystemReadiness.external_gates ?? []).map((gate) => <li key={gate}>{gate}</li>)}</ul>
            </details>
          </div>
        ) : (
          <p className="muted">Generate deterministic local evidence without running paid provider tests or changing project state.</p>
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

export function EnvironmentCenter(props: {
  busy: boolean;
  system: SystemInfo | null;
  tools: ToolReadiness | null;
  providers: ProviderDetection | null;
  cache: CacheReadiness | null;
  onRefresh: () => void;
}) {
  const capabilities = props.tools?.capabilities ?? [];
  const readyProviders = (props.providers?.providers ?? []).filter((provider) => provider.env_present || provider.local);
  const stableContracts = Object.values(props.system?.contracts ?? {}).filter((contract) => contract.status === "stable").length;
  return (
    <div className="panel environment-center">
      <div className="panel-heading">
        <div>
          <p className="label">MagAgent 0.91</p>
          <h3>Environment Center</h3>
        </div>
        <button className="icon-action" onClick={props.onRefresh} disabled={props.busy} type="button">
          <RefreshCcw size={16} />
          <span>Refresh</span>
        </button>
      </div>
      {!props.tools && !props.providers && !props.cache ? (
        <p className="muted">Check provider credentials, optional tool packs, prompt caching, and stable desktop contracts in one pass.</p>
      ) : (
        <div className="environment-grid">
          <div>
            <span className="label">Tool packs</span>
            <strong>{capabilities.filter((item) => item.available).length}/{capabilities.length} ready</strong>
            <div className="status-chip-list">
              {capabilities.map((item) => <span className={item.available ? "status-chip good" : "status-chip bad"} key={item.capability}>{item.capability}</span>)}
            </div>
          </div>
          <div>
            <span className="label">Available providers</span>
            <strong>{readyProviders.length} detected</strong>
            <div className="status-chip-list">
              {readyProviders.slice(0, 8).map((provider) => <span className="status-chip info" key={provider.id}>{provider.id}</span>)}
            </div>
          </div>
          <div>
            <span className="label">Prompt cache</span>
            <strong>{props.cache?.enabled ? "Enabled" : "Not enabled"}</strong>
            <p>{props.cache?.provider ? `${props.cache.provider} / ${props.cache.model}` : "No cache report loaded"}</p>
            {(props.cache?.recommendations ?? []).slice(0, 1).map((item) => <small key={item}>{item}</small>)}
          </div>
          <div>
            <span className="label">Desktop contracts</span>
            <strong>{stableContracts} stable</strong>
            <p>{props.system?.contracts?.task?.version ?? "Task contract not loaded"}</p>
            <small>{props.system?.contracts?.memory_recall?.version ? `Memory recall v${props.system.contracts.memory_recall.version}` : "Memory contract not loaded"}</small>
          </div>
        </div>
      )}
    </div>
  );
}
