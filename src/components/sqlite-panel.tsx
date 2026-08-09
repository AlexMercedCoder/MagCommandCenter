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
    <section className="browser-workspace sqlite-workspace">
      <div className="panel browser-hero">
        <div>
          <p className="label">SQLite Browser</p>
          <h3>Inspect MagAgent databases safely.</h3>
          <p>Choose a database, click a table to draft a query, then run paged read-only results in the main workspace.</p>
        </div>
        <div className="browser-stats">
          <div>
            <p className="label">DBs</p>
            <strong>{props.databases.length}</strong>
          </div>
          <div>
            <p className="label">Tables</p>
            <strong>{props.tableRows.rows.length}</strong>
          </div>
          <div>
            <p className="label">Rows</p>
            <strong>{props.resultRows.rows.length}</strong>
          </div>
        </div>
      </div>

      <div className="browser-grid sqlite-browser-grid">
        <div className="panel browser-sidebar">
          <div className="panel-heading">
            <h3>Database</h3>
            <Database size={20} />
          </div>
          <button className="primary-action compact-action" onClick={props.onLoadDbs} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Find Databases</span>
          </button>
          <label htmlFor="sqlite-db">Active database</label>
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
          <TableButtons rows={props.tableRows.rows} setQuery={props.setQuery} />
        </div>

        <div className="panel browser-main">
          <div className="panel-heading">
            <h3>Query Workspace</h3>
            <Search size={20} />
          </div>
          <textarea className="query-editor" value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
          <div className="row-actions">
            <button className="icon-action" onClick={() => props.setPage(Math.max(0, props.page - 1))} disabled={props.busy || props.page === 0} type="button">
              <RefreshCcw size={16} />
              <span>Prev</span>
            </button>
            <button className="icon-action" onClick={() => props.setPage(props.page + 1)} disabled={props.busy} type="button">
              <Search size={16} />
              <span>Next</span>
            </button>
            <button className="icon-action" onClick={props.onSaveQuery} disabled={!props.query.trim()} type="button">
              <Save size={16} />
              <span>Save</span>
            </button>
            <button className="primary-action" onClick={props.onRunQuery} disabled={props.busy || !props.selectedDb} type="button">
              <Database size={18} />
              <span>Run Page {props.page + 1}</span>
            </button>
          </div>
          <div className="result-header">
            <div>
              <p className="label">Result</p>
              <strong>{props.resultRows.rows.length ? `${props.resultRows.rows.length} rows` : "No rows yet"}</strong>
            </div>
            <select value={props.exportFormat} onChange={(event) => props.setExportFormat(event.target.value as "json" | "csv")}>
              <option value="json">JSON export</option>
              <option value="csv">CSV export</option>
            </select>
          </div>
          <DataPanel title="Query Result" icon={<Search size={20} />} value={props.result} table={props.resultRows} empty="Run a SELECT or WITH query." />
        </div>

        <div className="browser-side-stack">
          <details className="panel inline-details" open>
            <summary>Tables</summary>
            <DataPanel title="Tables" icon={<CheckCircle2 size={20} />} value={props.tables} table={props.tableRows} empty="Load tables for the selected database." />
          </details>
          <details className="panel inline-details">
            <summary>Saved Queries</summary>
            <div className="node-list compact-list">
              {props.savedQueries.length ? (
                props.savedQueries.slice(0, 8).map((query) => (
                  <button className="list-button compact" key={query} onClick={() => props.setQuery(query)} type="button">
                    {query.slice(0, 120)}
                  </button>
                ))
              ) : (
                <p className="muted">Save useful queries to reuse them here.</p>
              )}
            </div>
          </details>
          <details className="panel inline-details">
            <summary>Export Preview</summary>
            <pre>{props.resultRows.rows.length ? formatExport(props.resultRows, props.exportFormat) : "Run a query to prepare JSON/CSV export text."}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}

function TableButtons(props: { rows: Array<Record<string, unknown>>; setQuery: (value: string) => void }) {
  return (
    <div className="node-list browser-list compact-list">
      {props.rows.length ? (
        props.rows.slice(0, 30).map((row, index) => {
          const table = String(row.name ?? row.table ?? row.tbl_name ?? "");
          return table ? (
            <button className="list-button compact" key={`${table}-${index}`} onClick={() => props.setQuery(`select * from ${table}`)} type="button">
              <strong>{table}</strong>
              <span>Draft SELECT query</span>
            </button>
          ) : null;
        })
      ) : (
        <p className="muted">Load tables, then click one to draft a query.</p>
      )}
    </div>
  );
}

export function formatExport(table: TableData, format: "json" | "csv") {
  if (format === "json") return JSON.stringify(table.rows, null, 2);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [table.columns.map(escape).join(","), ...table.rows.map((row) => table.columns.map((column) => escape(row[column])).join(","))].join("\n");
}
