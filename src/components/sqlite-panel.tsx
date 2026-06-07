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

function formatExport(table: TableData, format: "json" | "csv") {
  if (format === "json") return JSON.stringify(table.rows, null, 2);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [table.columns.map(escape).join(","), ...table.rows.map((row) => table.columns.map((column) => escape(row[column])).join(","))].join("\n");
}
