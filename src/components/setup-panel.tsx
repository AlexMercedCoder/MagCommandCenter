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
  const guidance = setupGuidance(props.lastCommand, props.system?.magent_version, props.magentOk);
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
            <option value="pipx-install">pipx install mag-agent</option>
            <option value="pipx-upgrade">pipx upgrade mag-agent</option>
            <option value="pip-user">python3 -m pip install --user -U mag-agent</option>
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
      <div className="panel">
        <div className="panel-heading">
          <h3>Setup Diagnostics</h3>
          <Activity size={20} />
        </div>
        <div className="diagnostic-list">
          {guidance.map((item) => (
            <article className={`diagnostic ${item.tone}`} key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h3>Distribution Trust</h3>
          <ShieldCheck size={20} />
        </div>
        <div className="diagnostic-list">
          <article className="diagnostic info">
            <strong>Unsigned Desktop Builds</strong>
            <p>Early desktop artifacts may show macOS Gatekeeper or Windows SmartScreen warnings until release signing is configured.</p>
          </article>
          <article className="diagnostic good">
            <strong>Local Backend Contract</strong>
            <p>The app calls the installed MagAgent CLI and stores project chat state locally; setup commands remain allowlisted.</p>
          </article>
        </div>
      </div>
      <CommandPanel busy={props.busy} command={props.lastCommand} />
    </section>
  );
}

function setupGuidance(command: MagentCommandResult | null, version: string | undefined, magentOk: boolean) {
  const output = `${command?.stdout ?? ""}\n${command?.stderr ?? ""}`.toLowerCase();
  if (version && magentOk) {
    return [
      {
        title: "Desktop API Ready",
        detail: "MagAgent meets the minimum version for project chat, config, memory, SQLite, plugins, and workbench commands.",
        tone: "good"
      }
    ];
  }
  if (version && !magentOk) {
    return [
      {
        title: "Upgrade Required",
        detail: `Detected MagAgent ${version}, but this app expects ${minimumMagentVersion}+ for the desktop integration commands.`,
        tone: "bad"
      },
      {
        title: "Recommended Fix",
        detail: "Use pipx upgrade mag-agent, then run Detect again.",
        tone: "info"
      }
    ];
  }
  if (output.includes("not found") || output.includes("no such file") || output.includes("os error 2")) {
    return [
      {
        title: "MagAgent Is Not On PATH",
        detail: "Install with pipx, run pipx ensurepath if needed, then restart the app so the desktop process can see the updated PATH.",
        tone: "bad"
      },
      {
        title: "Advanced Override",
        detail: "Set MAGENT_BIN to the full magent executable path before launching the app if you use pyenv, uv, or a custom virtual environment.",
        tone: "info"
      }
    ];
  }
  if (output.includes("permission denied")) {
    return [
      {
        title: "Permission Problem",
        detail: "The detected MagAgent binary is not executable or the selected install location is blocked by the OS.",
        tone: "bad"
      },
      {
        title: "Recommended Fix",
        detail: "Prefer pipx install mag-agent or a user-scoped pip install, then run Detect again.",
        tone: "info"
      }
    ];
  }
  return [
    {
      title: "Start With Detect",
      detail: "Detect checks magent --version first, then asks MagAgent for system info when the CLI is available.",
      tone: "info"
    },
    {
      title: "Preferred Install",
      detail: "Use pipx install for the cleanest first-time setup; use user-scoped pip only when pipx is unavailable.",
      tone: "good"
    }
  ];
}
