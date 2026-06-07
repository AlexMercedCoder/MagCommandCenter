import { RefreshCcw } from "lucide-react";
import type { ReactNode } from "react";
import type { MagentCommandResult } from "../magent";
import type { TableData, Toast } from "../lib/types";
import { pretty } from "../lib/utils";

export function StatusCard(props: { title: string; icon: React.ElementType; status: string; detail: string; action: string; onAction: () => void }) {
  const Icon = props.icon;
  return (
    <div className="panel status-card">
      <div className="status-icon">
        <Icon size={22} />
      </div>
      <div>
        <p className="label">{props.title}</p>
        <h3>{props.status}</h3>
        <p>{props.detail}</p>
      </div>
      <button className="icon-action" onClick={props.onAction} type="button" title={props.action}>
        <RefreshCcw size={16} />
        <span>{props.action}</span>
      </button>
    </div>
  );
}

export function DataPanel(props: { title: string; icon: ReactNode; value: unknown; table: TableData; empty: string }) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>{props.title}</h3>
        {props.icon}
      </div>
      {props.table.rows.length ? <DataTable table={props.table} /> : <pre>{props.value ? JSON.stringify(props.value, null, 2) : props.empty}</pre>}
    </div>
  );
}

export function DataTable(props: { table: TableData }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {props.table.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.table.rows.slice(0, 100).map((row, index) => (
            <tr key={index}>
              {props.table.columns.map((column) => (
                <td key={column}>{pretty(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JsonPanel(props: { title: string; icon: ReactNode; value: unknown; empty: string }) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>{props.title}</h3>
        {props.icon}
      </div>
      <pre>{props.value ? JSON.stringify(props.value, null, 2) : props.empty}</pre>
    </div>
  );
}

export function CommandPanel(props: { busy: boolean; command: MagentCommandResult | null }) {
  return (
    <div className="panel command-panel">
      <div className="panel-heading">
        <h3>Last Command</h3>
        {props.busy && <span className="busy-dot" />}
      </div>
      <pre>{props.command ? JSON.stringify(props.command, null, 2) : "No command run yet."}</pre>
    </div>
  );
}

export function ToastStack(props: { toasts: Toast[] }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {props.toasts.map((toast) => (
        <div className={`toast ${toast.tone}`} key={toast.id}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
