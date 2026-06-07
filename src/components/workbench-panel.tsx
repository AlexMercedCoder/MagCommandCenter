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
