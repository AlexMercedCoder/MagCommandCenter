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
