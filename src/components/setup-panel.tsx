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
