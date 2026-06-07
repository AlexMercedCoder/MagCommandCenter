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
