import {
  Bot,
  FileCode2,
  Filter,
  FolderOpen,
  GitFork,
  ListTree,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type { AgentProfileSummary } from "../../../lib/types";
import { nodeTypes, type ViewMode } from "./utils";
import { sentenceCase } from "../../../lib/text";

export function GraphStart(props: {
  goal: string;
  setGoal: (value: string) => void;
  busy: boolean;
  hasDocument: boolean;
  onGenerate: (model: boolean) => void;
  onBlank: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="graph-generator panel">
      <div>
        <p className="label">Build a graph</p>
        <h3>Generate, load, and run visual workflows</h3>
        <p>
          Describe a goal and review the planning model’s validated draft before
          running it.
        </p>
      </div>
      <label>
        Workflow goal
        <textarea
          value={props.goal}
          onChange={(event) => props.setGoal(event.target.value)}
          placeholder="Implement the feature, verify it, and review the result."
        />
      </label>
      <div className="row-actions">
        <button
          className="primary-action"
          onClick={() => props.onGenerate(true)}
          disabled={props.busy || !props.goal.trim()}
          type="button"
        >
          <Bot size={17} />
          <span>{props.busy ? "Generating…" : "Generate with AI"}</span>
        </button>
        <button
          className="icon-action"
          onClick={props.onBlank}
          disabled={props.busy}
          type="button"
        >
          <Plus size={17} />
          <span>Blank graph</span>
        </button>
        <button
          className="icon-action"
          onClick={props.onOpen}
          disabled={props.busy}
          type="button"
        >
          <FolderOpen size={17} />
          <span>Open file</span>
        </button>
        <details className="graph-quick-draft">
          <summary>More options</summary>
          <button
            className="icon-action"
            onClick={() => props.onGenerate(false)}
            disabled={props.busy || !props.goal.trim()}
            type="button"
          >
            <Sparkles size={17} />
            <span>Quick deterministic draft</span>
          </button>
          {props.hasDocument && (
            <small>
              Generating replaces the current unsaved board after confirmation.
            </small>
          )}
        </details>
      </div>
    </div>
  );
}

export function GraphControls(props: {
  view: ViewMode;
  setView: (view: ViewMode) => void;
  query: string;
  setQuery: (value: string) => void;
  type: string;
  setType: (value: string) => void;
  profile: string;
  setProfile: (value: string) => void;
  label: string;
  setLabel: (value: string) => void;
  profiles: AgentProfileSummary[];
  labels: string[];
  compact: boolean;
  setCompact: (value: boolean) => void;
}) {
  return (
    <div className="graph-controls panel">
      <div className="segmented">
        {(["board", "map", "source"] as ViewMode[]).map((view) => (
          <button
            className={props.view === view ? "active" : ""}
            onClick={() => props.setView(view)}
            type="button"
            key={view}
          >
            {view === "board" ? (
              <GitFork />
            ) : view === "map" ? (
              <ListTree />
            ) : (
              <FileCode2 />
            )}
            {sentenceCase(view)}
          </button>
        ))}
      </div>
      <label className="search-field">
        <Search size={15} />
        <input
          aria-label="Filter graph cards"
          value={props.query}
          onChange={(event) => props.setQuery(event.target.value)}
          placeholder="Filter cards"
        />
      </label>
      <Filter size={16} />
      <select
        aria-label="Filter by node type"
        value={props.type}
        onChange={(event) => props.setType(event.target.value)}
      >
        <option value="">All types</option>
        {nodeTypes.map((type) => (
          <option key={type}>{type}</option>
        ))}
      </select>
      <select
        aria-label="Filter by profile"
        value={props.profile}
        onChange={(event) => props.setProfile(event.target.value)}
      >
        <option value="">All profiles</option>
        {props.profiles.map((profile) => (
          <option key={profile.name}>{profile.name}</option>
        ))}
      </select>
      <select
        aria-label="Filter by label"
        value={props.label}
        onChange={(event) => props.setLabel(event.target.value)}
      >
        <option value="">All labels</option>
        {props.labels.map((label) => (
          <option key={label}>{label}</option>
        ))}
      </select>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={props.compact}
          onChange={(event) => props.setCompact(event.target.checked)}
        />
        Compact
      </label>
    </div>
  );
}
