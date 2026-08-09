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
  Undo2,
  Send,
  XCircle
} from "lucide-react";
import { CommandPanel, DataPanel, JsonPanel, StatusCard } from "./common";
import { minimumMagentVersion, recipePrompts } from "../lib/constants";
import type { ChatMessage, ChatSession, Checkpoint, ConfigField, MemoryNode, ProjectInspection, Readiness, SessionPeer, SetupMethod, SqliteDatabase, SystemInfo, TableData } from "../lib/types";
import { databaseValue, encodeFieldValue, extractRows, listFromUnknown, pretty, tableFromRows } from "../lib/utils";
import type { MagentCommandResult } from "../magent";

export function WorkbenchPanel(props: {
  busy: boolean;
  project: string;
  recipeName: string;
  setRecipeName: (value: string) => void;
  result: Record<string, unknown> | null;
  commandHistory: MagentCommandResult[];
  checkpoints: Checkpoint[];
  selectedCheckpoint: string;
  checkpointDiff: string;
  peers: SessionPeer[];
  peerTarget: string;
  peerMessage: string;
  setPeerTarget: (value: string) => void;
  setPeerMessage: (value: string) => void;
  onListRecipes: () => void;
  onRunRecipe: (name?: string) => void;
  onInspectPatch: () => void;
  onLoadCheckpoints: () => void;
  onInspectCheckpoint: (id: string) => void;
  onRestoreCheckpoint: (id: string) => void;
  onLoadPeers: () => void;
  onSendPeerMessage: () => void;
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
            <h3>Checkpoints</h3>
            <Undo2 size={20} />
          </div>
          <div className="row-actions">
            <button className="icon-action" onClick={props.onLoadCheckpoints} disabled={props.busy} type="button">
              <RefreshCcw size={16} />
              <span>Refresh</span>
            </button>
          </div>
          <div className="timeline" aria-label="File checkpoints">
            {props.checkpoints.length ? props.checkpoints.map((checkpoint) => (
              <article className={checkpoint.id === props.selectedCheckpoint ? "timeline-item active" : "timeline-item"} key={checkpoint.id}>
                <button className="list-button compact" onClick={() => props.onInspectCheckpoint(checkpoint.id)} type="button">
                  <strong>{checkpoint.operation || "file change"}</strong>
                  <span>{checkpoint.path || checkpoint.id}</span>
                </button>
                <button className="icon-action" onClick={() => props.onRestoreCheckpoint(checkpoint.id)} disabled={props.busy} type="button" title="Restore this file checkpoint">
                  <Undo2 size={15} />
                  <span>Restore</span>
                </button>
              </article>
            )) : <p className="muted">No file checkpoints loaded.</p>}
          </div>
          {props.checkpointDiff && <pre className="code-preview" tabIndex={0}>{props.checkpointDiff}</pre>}
        </div>
        <div className="panel command-panel">
          <div className="panel-heading">
            <h3>Session Coordination</h3>
            <MessageSquareText size={20} />
          </div>
          <div className="row-actions">
            <button className="icon-action" onClick={props.onLoadPeers} disabled={props.busy} type="button">
              <RefreshCcw size={16} />
              <span>Find Sessions</span>
            </button>
          </div>
          <label htmlFor="peer-target">Recipient</label>
          <select id="peer-target" value={props.peerTarget} onChange={(event) => props.setPeerTarget(event.target.value)}>
            <option value="">Choose a live session</option>
            {props.peers.map((peer) => {
              const id = peer.session_id || peer.id || "";
              return <option key={id} value={id}>{peer.name || id} {peer.project || peer.cwd ? `- ${peer.project || peer.cwd}` : ""}</option>;
            })}
          </select>
          <label htmlFor="peer-message">Message</label>
          <textarea id="peer-message" value={props.peerMessage} onChange={(event) => props.setPeerMessage(event.target.value)} placeholder="Send bounded coordination context, not hidden instructions or credentials." />
          <button className="primary-action" onClick={props.onSendPeerMessage} disabled={props.busy || !props.peerTarget || !props.peerMessage.trim()} type="button">
            <Send size={16} />
            <span>Send Message</span>
          </button>
        </div>
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
