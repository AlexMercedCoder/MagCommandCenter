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

export function SetupPanel(props: {
  busy: boolean;
  system: SystemInfo | null;
  magentOk: boolean;
  setupMethod: SetupMethod;
  setSetupMethod: (value: SetupMethod) => void;
  setupDismissed: boolean;
  setSetupDismissed: (value: boolean) => void;
  onDetect: () => void;
  onInstall: () => void;
  lastCommand: MagentCommandResult | null;
}) {
  const status = props.system?.magent_version
    ? props.magentOk
      ? `MagAgent ${props.system.magent_version} is ready`
      : `MagAgent ${props.system.magent_version} needs upgrade`
    : "MagAgent was not detected";
  return (
    <section className="content-grid">
      <div className="panel hero-panel">
        <div>
          <p className="label">First-Time Wizard</p>
          <h3>{status}</h3>
          <p>Command Center can install or upgrade MagAgent for first-time users, then all setup continues through the same CLI-backed config and readiness checks.</p>
        </div>
        <div className="stack">
          <button className="primary-action" onClick={props.onDetect} disabled={props.busy} type="button">
            <TerminalSquare size={18} />
            <span>Detect MagAgent</span>
          </button>
          <label htmlFor="setup-method">Install method</label>
          <select id="setup-method" value={props.setupMethod} onChange={(event) => props.setSetupMethod(event.target.value as SetupMethod)}>
            <option value="pipx-install">pipx install magagent</option>
            <option value="pipx-upgrade">pipx upgrade magagent</option>
            <option value="pip-user">python3 -m pip install --user -U magagent</option>
          </select>
          <button className="icon-action" onClick={props.onInstall} disabled={props.busy} type="button">
            <Wand2 size={16} />
            <span>Install or Upgrade</span>
          </button>
          <button className="icon-action" onClick={() => props.setSetupDismissed(!props.setupDismissed)} type="button">
            {props.setupDismissed ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{props.setupDismissed ? "Show Setup Banner" : "Dismiss Setup Banner"}</span>
          </button>
        </div>
      </div>
      <StatusCard
        title="Required Version"
        icon={ShieldCheck}
        status={`${minimumMagentVersion}+`}
        detail={props.magentOk ? "Desktop APIs ready" : "Install or upgrade before using desktop-only flows"}
        action="Detect"
        onAction={props.onDetect}
      />
      <StatusCard
        title="Safe Install Surface"
        icon={KeyRound}
        status="Restricted"
        detail="Only MagAgent bootstrap commands are allowed from setup"
        action="Install"
        onAction={props.onInstall}
      />
      <CommandPanel busy={props.busy} command={props.lastCommand} />
    </section>
  );
}

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
  onRun: () => void;
  onClear: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel chat-panel">
        <div className="panel-heading">
          <h3>Project Chat</h3>
          <Sparkles size={20} />
        </div>
        <div className="session-switcher">
          <label htmlFor="chat-session">Session</label>
          <select id="chat-session" value={props.session} onChange={(event) => props.setSession(event.target.value)}>
            {props.sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
          <input value={props.sessionDraftName} onChange={(event) => props.setSessionDraftName(event.target.value)} placeholder="Session name" />
          <button className="icon-action" onClick={props.onNewSession} type="button">
            <MessageSquareText size={16} />
            <span>New</span>
          </button>
          <button className="icon-action" onClick={props.onRenameSession} disabled={!props.sessionDraftName.trim()} type="button">
            <Save size={16} />
            <span>Rename</span>
          </button>
          <button className="icon-action" onClick={props.onDeleteSession} disabled={props.sessions.length < 2} type="button">
            <XCircle size={16} />
            <span>Delete</span>
          </button>
        </div>
        <SessionBrowser sessions={props.sessions} active={props.session} onSelect={props.setSession} />
        <div className="prompt-grid">
          {props.quickPrompts.map((prompt) => (
            <button className="list-button compact" key={prompt} onClick={() => props.setPrompt(prompt)} type="button">
              {prompt}
            </button>
          ))}
        </div>
        <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} />
        <div className="row-actions">
          <button className="primary-action" onClick={props.onRun} disabled={props.busy} type="button">
            <MessageSquareText size={18} />
            <span>{props.busy ? "Running" : "Run Ask"}</span>
          </button>
          <button className="icon-action" onClick={props.onClear} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Clear</span>
          </button>
        </div>
        <Transcript messages={props.history} />
      </div>
      <div className="stack">
        <Timeline events={props.events} busy={props.busy} />
        <StreamPanel lines={props.streamLines} />
        <JsonPanel title="Response JSON" icon={<Search size={20} />} value={props.response} empty="Run a project ask to see JSON output." />
      </div>
    </section>
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

export function ResearchPanel(props: {
  busy: boolean;
  topic: string;
  question: string;
  result: Record<string, unknown> | null;
  setTopic: (value: string) => void;
  setQuestion: (value: string) => void;
  onRun: () => void;
}) {
  const sources = extractRows(props.result).length ? extractRows(props.result) : extractRows({ rows: props.result?.sources });
  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-heading">
          <h3>Deep Research</h3>
          <Search size={20} />
        </div>
        <div className="stack">
          <label htmlFor="research-topic">Topic</label>
          <textarea id="research-topic" value={props.topic} onChange={(event) => props.setTopic(event.target.value)} />
          <label htmlFor="research-question">Focus question</label>
          <input id="research-question" value={props.question} onChange={(event) => props.setQuestion(event.target.value)} />
          <button className="primary-action" onClick={props.onRun} disabled={props.busy} type="button">
            <Search size={18} />
            <span>{props.busy ? "Researching" : "Run Research"}</span>
          </button>
        </div>
      </div>
      <div className="stack">
        <div className="panel command-panel">
          <div className="panel-heading">
            <h3>Summary</h3>
            <Sparkles size={20} />
          </div>
          <pre>{props.result?.summary ? String(props.result.summary) : "Research summary will appear here."}</pre>
        </div>
        <DataPanel title="Sources" icon={<Search size={20} />} value={props.result} table={tableFromRows(sources)} empty="Research sources will appear here." />
      </div>
    </section>
  );
}

function Transcript(props: { messages: ChatMessage[] }) {
  return (
    <div className="transcript">
      {props.messages.length ? (
        props.messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <p className="label">{message.role}</p>
            <p>{message.content}</p>
          </article>
        ))
      ) : (
        <p className="muted">Chat history for this project will appear here.</p>
      )}
    </div>
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

export function ConfigPanel(props: {
  busy: boolean;
  config: Record<string, unknown> | null;
  fields: ConfigField[];
  values: Record<string, string>;
  setValues: (values: Record<string, string>) => void;
  configPath: string;
  configValue: string;
  setConfigPath: (value: string) => void;
  setConfigValue: (value: string) => void;
  onLoad: () => void;
  onSave: (path?: string, value?: string) => void;
}) {
  const categories = Array.from(new Set(props.fields.map((field) => field.category ?? "General")));

  function setValue(path: string, value: string) {
    props.setValues({ ...props.values, [path]: value });
  }

  return (
    <section className="two-column">
      <div className="stack">
        <div className="panel">
          <div className="panel-heading">
            <h3>Guided Setup</h3>
            <Settings2 size={20} />
          </div>
          <div className="wizard-steps">
            <StepBadge index={1} label="Provider" active={Boolean(props.values["defaults.provider"])} />
            <StepBadge index={2} label="Models" active={props.fields.some((field) => field.path.includes("model"))} />
            <StepBadge index={3} label="Memory" active={props.fields.some((field) => field.path.includes("memory"))} />
            <StepBadge index={4} label="Tools" active={props.fields.some((field) => field.path.includes("tool"))} />
          </div>
          <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Load Schema</span>
          </button>
        </div>
        {categories.length && props.fields.length ? (
          categories.map((category) => (
            <div className="panel" key={category}>
              <div className="panel-heading">
                <h3>{category}</h3>
                <Settings2 size={20} />
              </div>
              <div className="settings-grid">
                {props.fields
                  .filter((field) => (field.category ?? "General") === category)
                  .map((field) => (
                    <div className="setting-row" key={field.path}>
                      <label htmlFor={`config-${field.path}`}>{field.label}</label>
                      {field.choices?.length ? (
                        <select id={`config-${field.path}`} value={props.values[field.path] ?? ""} onChange={(event) => setValue(field.path, event.target.value)}>
                          {field.choices.map((choice) => (
                            <option key={choice} value={choice}>
                              {choice}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "boolean" ? (
                        <select id={`config-${field.path}`} value={props.values[field.path] ?? "false"} onChange={(event) => setValue(field.path, event.target.value)}>
                          <option value="true">enabled</option>
                          <option value="false">disabled</option>
                        </select>
                      ) : (
                        <input id={`config-${field.path}`} value={props.values[field.path] ?? ""} onChange={(event) => setValue(field.path, event.target.value)} />
                      )}
                      <button className="icon-action" onClick={() => props.onSave(field.path, encodeFieldValue(field, props.values[field.path] ?? ""))} disabled={props.busy} type="button">
                        <Save size={16} />
                        <span>Save</span>
                      </button>
                      {field.description && <p className="setting-help">{field.description}</p>}
                    </div>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <div className="panel">
            <p className="muted">Load schema from MagAgent 0.30+ to render guided provider, model, memory, and tool settings.</p>
          </div>
        )}
        <div className="panel">
          <div className="panel-heading">
            <h3>Advanced Dot Path</h3>
            <Settings2 size={20} />
          </div>
          <div className="stack">
            <label htmlFor="config-path">Dot path</label>
            <input id="config-path" value={props.configPath} onChange={(event) => props.setConfigPath(event.target.value)} />
            <label htmlFor="config-value">JSON or string value</label>
            <input id="config-value" value={props.configValue} onChange={(event) => props.setConfigValue(event.target.value)} placeholder='"openai" or true' />
            <button className="primary-action" onClick={() => props.onSave()} disabled={props.busy} type="button">
              <Save size={18} />
              <span>Save Value</span>
            </button>
          </div>
        </div>
      </div>
      <JsonPanel title="Redacted Config" icon={<ShieldCheck size={20} />} value={props.config} empty="Load config to inspect redacted settings." />
    </section>
  );
}

function StepBadge(props: { index: number; label: string; active: boolean }) {
  return (
    <div className={props.active ? "step-badge active" : "step-badge"}>
      <strong>{props.index}</strong>
      <span>{props.label}</span>
    </div>
  );
}

export function MemoryPanel(props: {
  busy: boolean;
  query: string;
  setQuery: (value: string) => void;
  nodes: MemoryNode[];
  selectedNodeId: string;
  setSelectedNodeId: (value: string) => void;
  selectedNode: Record<string, unknown> | null;
  editBody: string;
  setEditBody: (value: string) => void;
  preview: Record<string, unknown> | null;
  inbox: Record<string, unknown> | null;
  selectedInboxId: string;
  setSelectedInboxId: (value: string) => void;
  inboxEditBody: string;
  setInboxEditBody: (value: string) => void;
  improvePrompt: string;
  setImprovePrompt: (value: string) => void;
  mergeTargetId: string;
  mergeSourceId: string;
  suppressReason: string;
  setMergeTargetId: (value: string) => void;
  setMergeSourceId: (value: string) => void;
  setSuppressReason: (value: string) => void;
  onLoad: () => void;
  onLoadNode: (id?: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onImprove: () => void;
  onLoadInbox: () => void;
  onInboxAction: (action: "accept" | "reject") => void;
  onSuppress: () => void;
  onUnsuppress: () => void;
  onMerge: (preview: boolean) => void;
}) {
  return (
    <section className="two-column memory-layout">
      <div className="panel">
        <div className="panel-heading">
          <h3>Memory Graph</h3>
          <Brain size={20} />
        </div>
        <div className="stack">
          <label htmlFor="memory-query">Search</label>
          <input id="memory-query" value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
          <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
            <Search size={16} />
            <span>Load Graph</span>
          </button>
          <MiniGraph nodes={props.nodes} selectedNodeId={props.selectedNodeId} />
          <MemoryInbox
            inbox={props.inbox}
            selectedId={props.selectedInboxId}
            setSelectedId={props.setSelectedInboxId}
            editBody={props.inboxEditBody}
            setEditBody={props.setInboxEditBody}
            busy={props.busy}
            onLoad={props.onLoadInbox}
            onAction={props.onInboxAction}
          />
          <div className="node-list">
            {props.nodes.length ? (
              props.nodes.map((node) => {
                const id = String(node.id ?? node.path ?? "");
                return (
                  <button
                    className="list-button"
                    key={id}
                    onClick={() => {
                      props.setSelectedNodeId(id);
                      props.onLoadNode(id);
                    }}
                    type="button"
                  >
                    <strong>{node.title ?? node.id ?? "Memory node"}</strong>
                    <span>{node.type ?? node.path ?? id}</span>
                  </button>
                );
              })
            ) : (
              <p className="muted">Load memory to browse graph nodes.</p>
            )}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h3>Node Editor</h3>
          <Search size={20} />
        </div>
        <div className="stack">
          <label htmlFor="node-id">Node ID</label>
          <input id="node-id" value={props.selectedNodeId} onChange={(event) => props.setSelectedNodeId(event.target.value)} />
          <button className="icon-action" onClick={() => props.onLoadNode()} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Inspect</span>
          </button>
          <MemoryProvenance node={props.selectedNode} />
          <label htmlFor="memory-body">Markdown body</label>
          <textarea id="memory-body" value={props.editBody} onChange={(event) => props.setEditBody(event.target.value)} />
          <label htmlFor="memory-improve">Memory improvement prompt</label>
          <input id="memory-improve" value={props.improvePrompt} onChange={(event) => props.setImprovePrompt(event.target.value)} />
          <div className="row-actions">
            <button className="icon-action" onClick={props.onPreview} disabled={props.busy || !props.selectedNodeId} type="button">
              <Search size={16} />
              <span>Preview Edit</span>
            </button>
            <button className="primary-action" onClick={props.onApply} disabled={props.busy || !props.selectedNodeId} type="button">
              <Save size={18} />
              <span>Apply Edit</span>
            </button>
            <button className="icon-action" onClick={props.onImprove} disabled={props.busy || !props.selectedNodeId} type="button">
              <Sparkles size={16} />
              <span>Improve in Chat</span>
            </button>
          </div>
          <pre>{props.preview ? JSON.stringify(props.preview, null, 2) : "Preview returns old/new hashes before writing."}</pre>
          <label htmlFor="suppress-reason">Suppress reason</label>
          <input id="suppress-reason" value={props.suppressReason} onChange={(event) => props.setSuppressReason(event.target.value)} />
          <div className="row-actions">
            <button className="icon-action" onClick={props.onSuppress} disabled={props.busy || !props.selectedNodeId} type="button">
              <ShieldCheck size={16} />
              <span>Suppress</span>
            </button>
            <button className="icon-action" onClick={props.onUnsuppress} disabled={props.busy || !props.selectedNodeId} type="button">
              <RefreshCcw size={16} />
              <span>Unsuppress</span>
            </button>
          </div>
          <div className="merge-box">
            <h3>Merge Nodes</h3>
            <input value={props.mergeTargetId} onChange={(event) => props.setMergeTargetId(event.target.value)} placeholder="Target node ID" />
            <input value={props.mergeSourceId} onChange={(event) => props.setMergeSourceId(event.target.value)} placeholder="Source node ID" />
            <div className="row-actions">
              <button className="icon-action" onClick={() => props.onMerge(true)} disabled={props.busy} type="button">
                <Search size={16} />
                <span>Preview</span>
              </button>
              <button className="primary-action" onClick={() => props.onMerge(false)} disabled={props.busy} type="button">
                <Save size={18} />
                <span>Merge</span>
              </button>
            </div>
          </div>
          <JsonPanel title="Raw Node" icon={<Brain size={20} />} value={props.selectedNode} empty="Select or enter a node ID." />
        </div>
      </div>
    </section>
  );
}

function MemoryInbox(props: {
  inbox: Record<string, unknown> | null;
  selectedId: string;
  setSelectedId: (value: string) => void;
  editBody: string;
  setEditBody: (value: string) => void;
  busy: boolean;
  onLoad: () => void;
  onAction: (action: "accept" | "reject") => void;
}) {
  const candidates = extractRows(props.inbox);
  return (
    <div className="merge-box">
      <div className="panel-heading">
        <h3>Memory Inbox</h3>
        <ClipboardList size={18} />
      </div>
      <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
        <RefreshCcw size={16} />
        <span>Load Inbox</span>
      </button>
      <input value={props.selectedId} onChange={(event) => props.setSelectedId(event.target.value)} placeholder="Candidate ID" />
      <textarea value={props.editBody} onChange={(event) => props.setEditBody(event.target.value)} placeholder="Edit candidate before promoting, or use this as a rewrite scratchpad." />
      <div className="row-actions">
        <button className="icon-action" onClick={() => props.onAction("accept")} disabled={props.busy || !props.selectedId} type="button">
          <CheckCircle2 size={16} />
          <span>Accept</span>
        </button>
        <button className="icon-action" onClick={() => props.onAction("reject")} disabled={props.busy || !props.selectedId} type="button">
          <XCircle size={16} />
          <span>Reject</span>
        </button>
      </div>
      <div className="node-list compact-list">
        {candidates.length ? (
          candidates.map((candidate, index) => {
            const id = String(candidate.id ?? candidate.candidate_id ?? index);
            return (
              <button
                className="list-button compact"
                key={id}
                onClick={() => {
                  props.setSelectedId(id);
                  props.setEditBody(String(candidate.body ?? candidate.content ?? candidate.summary ?? ""));
                }}
                type="button"
              >
                <strong>{id}</strong>
                <span>{String(candidate.summary ?? candidate.reason ?? candidate.source ?? "")}</span>
              </button>
            );
          })
        ) : (
          <p className="muted">Pending memory candidates appear here.</p>
        )}
      </div>
    </div>
  );
}

function MiniGraph(props: { nodes: MemoryNode[]; selectedNodeId: string }) {
  const nodes = props.nodes.slice(0, 18);
  return (
    <div className="mini-graph" aria-label="Memory graph preview">
      {nodes.length ? (
        nodes.map((node, index) => {
          const id = String(node.id ?? node.path ?? index);
          return (
            <div
              className={props.selectedNodeId === id ? "graph-node active" : "graph-node"}
              key={id}
              style={{ gridColumn: `${(index % 6) + 1}`, gridRow: `${Math.floor(index / 6) + 1}` }}
              title={id}
            >
              {String(node.type ?? "m").slice(0, 2)}
            </div>
          );
        })
      ) : (
        <p className="muted">Graph preview appears after loading memory.</p>
      )}
    </div>
  );
}

function MemoryProvenance(props: { node: Record<string, unknown> | null }) {
  if (!props.node) return <p className="muted">Inspect a node to see backlinks, links, and provenance.</p>;
  const links = listFromUnknown(props.node.links);
  const backlinks = listFromUnknown(props.node.backlinks);
  const provenance = props.node.provenance ?? props.node.metadata;
  return (
    <div className="provenance-grid">
      <div>
        <p className="label">Links</p>
        <strong>{links.length}</strong>
      </div>
      <div>
        <p className="label">Backlinks</p>
        <strong>{backlinks.length}</strong>
      </div>
      <div>
        <p className="label">Provenance</p>
        <span>{provenance ? "Available" : "Not provided"}</span>
      </div>
    </div>
  );
}

export function SQLitePanel(props: {
  busy: boolean;
  databases: SqliteDatabase[];
  selectedDb: string;
  setSelectedDb: (value: string) => void;
  tables: Record<string, unknown> | null;
  tableRows: TableData;
  query: string;
  setQuery: (value: string) => void;
  page: number;
  setPage: (value: number) => void;
  savedQueries: string[];
  onSaveQuery: () => void;
  result: Record<string, unknown> | null;
  resultRows: TableData;
  exportFormat: "json" | "csv";
  setExportFormat: (value: "json" | "csv") => void;
  onLoadDbs: () => void;
  onLoadTables: () => void;
  onRunQuery: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-heading">
          <h3>SQLite Explorer</h3>
          <Database size={20} />
        </div>
        <div className="stack">
          <button className="icon-action" onClick={props.onLoadDbs} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>List DBs</span>
          </button>
          <label htmlFor="sqlite-db">Database</label>
          <select id="sqlite-db" value={props.selectedDb} onChange={(event) => props.setSelectedDb(event.target.value)}>
            <option value="">Select database</option>
            {props.databases.map((db) => {
              const value = databaseValue(db);
              return (
                <option key={value} value={value}>
                  {db.label ?? db.name ?? db.key ?? value}
                </option>
              );
            })}
          </select>
          <button className="icon-action" onClick={props.onLoadTables} disabled={props.busy || !props.selectedDb} type="button">
            <Search size={16} />
            <span>Load Tables</span>
          </button>
          <div className="prompt-grid">
            {props.tableRows.rows.slice(0, 6).map((row, index) => {
              const table = String(row.name ?? row.table ?? row.tbl_name ?? "");
              return table ? (
                <button className="list-button compact" key={`${table}-${index}`} onClick={() => props.setQuery(`select * from ${table}`)} type="button">
                  {table}
                </button>
              ) : null;
            })}
          </div>
          <div className="row-actions">
            {props.savedQueries.slice(0, 4).map((query) => (
              <button className="list-button compact" key={query} onClick={() => props.setQuery(query)} type="button">
                {query.slice(0, 80)}
              </button>
            ))}
          </div>
          <textarea value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
          <div className="row-actions">
            <button className="icon-action" onClick={() => props.setPage(Math.max(0, props.page - 1))} disabled={props.busy || props.page === 0} type="button">
              <RefreshCcw size={16} />
              <span>Prev Page</span>
            </button>
            <button className="icon-action" onClick={() => props.setPage(props.page + 1)} disabled={props.busy} type="button">
              <Search size={16} />
              <span>Next Page</span>
            </button>
            <button className="icon-action" onClick={props.onSaveQuery} disabled={!props.query.trim()} type="button">
              <Save size={16} />
              <span>Save Query</span>
            </button>
            <select value={props.exportFormat} onChange={(event) => props.setExportFormat(event.target.value as "json" | "csv")}>
              <option value="json">JSON export</option>
              <option value="csv">CSV export</option>
            </select>
            <button className="primary-action" onClick={props.onRunQuery} disabled={props.busy || !props.selectedDb} type="button">
              <Database size={18} />
              <span>Run Page {props.page + 1}</span>
            </button>
          </div>
        </div>
      </div>
      <div className="stack">
        <DataPanel title="Tables" icon={<CheckCircle2 size={20} />} value={props.tables} table={props.tableRows} empty="Load tables for the selected database." />
        <DataPanel title="Query Result" icon={<Search size={20} />} value={props.result} table={props.resultRows} empty="Run a SELECT or WITH query." />
        <pre>{props.resultRows.rows.length ? formatExport(props.resultRows, props.exportFormat) : "Run a query to prepare JSON/CSV export text."}</pre>
      </div>
    </section>
  );
}

export function PluginsPanel(props: {
  busy: boolean;
  plugins: Record<string, unknown> | null;
  pluginRows: Array<Record<string, unknown>>;
  pluginName: string;
  pluginSource: string;
  pluginImportKind: string;
  pluginReview: Record<string, unknown> | null;
  setPluginName: (value: string) => void;
  setPluginSource: (value: string) => void;
  setPluginImportKind: (value: string) => void;
  choosePluginSource: () => void;
  onLoad: () => void;
  onReview: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onInstall: () => void;
  onImport: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-heading">
          <h3>Skills + Plugins</h3>
          <Plug size={20} />
        </div>
        <div className="stack">
          <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Load Plugins</span>
          </button>
          <label htmlFor="plugin-name">Plugin name</label>
          <input id="plugin-name" value={props.pluginName} onChange={(event) => props.setPluginName(event.target.value)} placeholder="installed-pack-name" />
          <label htmlFor="plugin-source">Plugin source</label>
          <input id="plugin-source" value={props.pluginSource} onChange={(event) => props.setPluginSource(event.target.value)} placeholder="/path/to/plugin" />
          <button className="icon-action" onClick={props.choosePluginSource} type="button">
            <FolderOpen size={16} />
            <span>Select Folder</span>
          </button>
          <label htmlFor="plugin-kind">Import kind</label>
          <select id="plugin-kind" value={props.pluginImportKind} onChange={(event) => props.setPluginImportKind(event.target.value)}>
            <option value="codex-skill">Codex skill</option>
            <option value="opencode">OpenCode</option>
            <option value="claude">Claude</option>
            <option value="mcp">MCP</option>
          </select>
          <div className="row-actions">
            <button className="icon-action" onClick={props.onReview} disabled={props.busy || (!props.pluginName && !props.pluginSource)} type="button">
              <ShieldCheck size={16} />
              <span>Review</span>
            </button>
            <button className="icon-action" onClick={props.onInstall} disabled={props.busy || !props.pluginSource} type="button">
              <Save size={16} />
              <span>Install</span>
            </button>
            <button className="icon-action" onClick={props.onImport} disabled={props.busy || !props.pluginSource} type="button">
              <Plug size={16} />
              <span>Import</span>
            </button>
            <button className="icon-action" onClick={props.onEnable} disabled={props.busy || !props.pluginName} type="button">
              <Plug size={16} />
              <span>Enable</span>
            </button>
            <button className="icon-action" onClick={props.onDisable} disabled={props.busy || !props.pluginName} type="button">
              <ShieldCheck size={16} />
              <span>Disable</span>
            </button>
          </div>
          <PluginCards rows={props.pluginRows} onSelect={props.setPluginName} />
        </div>
      </div>
      <div className="stack">
        <PluginReview value={props.pluginReview} />
        <JsonPanel title="Installed Packs" icon={<Plug size={20} />} value={props.plugins} empty="Load plugins to inspect installed packs." />
      </div>
    </section>
  );
}

function PluginReview(props: { value: Record<string, unknown> | null }) {
  const rows = extractRows(props.value);
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>Safety Review</h3>
        <ShieldCheck size={20} />
      </div>
      <div className="provenance-grid">
        <div>
          <p className="label">Capabilities</p>
          <strong>{listFromUnknown(props.value?.capabilities).length || rows.length || 0}</strong>
        </div>
        <div>
          <p className="label">Permissions</p>
          <strong>{listFromUnknown(props.value?.permissions).length}</strong>
        </div>
        <div>
          <p className="label">Trust</p>
          <span>{String(props.value?.trust_status ?? props.value?.trust ?? "unknown")}</span>
        </div>
      </div>
      <pre>{props.value ? JSON.stringify(props.value, null, 2) : "Review a plugin name or source before install/import."}</pre>
    </div>
  );
}

function PluginCards(props: { rows: Array<Record<string, unknown>>; onSelect: (name: string) => void }) {
  return (
    <div className="node-list">
      {props.rows.length ? (
        props.rows.map((plugin, index) => {
          const name = String(plugin.name ?? plugin.plugin ?? plugin.id ?? "");
          const enabled = String(plugin.enabled ?? plugin.status ?? "");
          const source = String(plugin.source ?? plugin.path ?? "");
          return (
            <button className="list-button" key={name || index} onClick={() => props.onSelect(name)} type="button">
              <strong>{name || "Plugin pack"}</strong>
              <span>{enabled || "status unknown"}</span>
              {source && <span>{source}</span>}
            </button>
          );
        })
      ) : (
        <p className="muted">Load plugins to select an installed pack.</p>
      )}
    </div>
  );
}

function formatExport(table: TableData, format: "json" | "csv") {
  if (format === "json") return JSON.stringify(table.rows, null, 2);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [table.columns.map(escape).join(","), ...table.rows.map((row) => table.columns.map((column) => escape(row[column])).join(","))].join("\n");
}

export function WorkbenchPanel(props: {
  busy: boolean;
  project: string;
  recipeName: string;
  setRecipeName: (value: string) => void;
  result: Record<string, unknown> | null;
  commandHistory: MagentCommandResult[];
  onListRecipes: () => void;
  onRunRecipe: (name?: string) => void;
  onInspectPatch: () => void;
}) {
  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-heading">
          <h3>Session + Plan Workbench</h3>
          <Workflow size={20} />
        </div>
        <div className="stack">
          <p className="muted">Project: {props.project}</p>
          <label htmlFor="recipe-name">Recipe</label>
          <input id="recipe-name" value={props.recipeName} onChange={(event) => props.setRecipeName(event.target.value)} />
          <div className="row-actions">
            <button className="icon-action" onClick={props.onListRecipes} disabled={props.busy} type="button">
              <ClipboardList size={16} />
              <span>List Recipes</span>
            </button>
            <button className="primary-action" onClick={() => props.onRunRecipe()} disabled={props.busy} type="button">
              <Play size={18} />
              <span>Run Recipe</span>
            </button>
            <button className="icon-action" onClick={props.onInspectPatch} disabled={props.busy} type="button">
              <Search size={16} />
              <span>Inspect Patch</span>
            </button>
          </div>
          <div className="prompt-grid">
            {recipePrompts.map((recipe) => (
              <button className="list-button compact" key={recipe.name} onClick={() => props.onRunRecipe(recipe.command[2])} type="button">
                {recipe.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="stack">
        <JsonPanel title="Workbench Result" icon={<Workflow size={20} />} value={props.result} empty="Run a recipe or inspect a patch to see structured output." />
        <div className="panel command-panel">
          <div className="panel-heading">
            <h3>Command History</h3>
            <TerminalSquare size={20} />
          </div>
          <div className="timeline">
            {props.commandHistory.length ? (
              props.commandHistory.slice(0, 12).map((command, index) => (
                <article className="timeline-item" key={`${command.command}-${index}`}>
                  <strong>{command.ok ? "OK" : "Review"}</strong>
                  <span>{command.command}</span>
                </article>
              ))
            ) : (
              <p className="muted">Commands run from Command Center will appear here.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
