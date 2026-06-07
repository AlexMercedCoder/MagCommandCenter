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
