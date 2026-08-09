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

export function MemoryPanel(props: {
  busy: boolean;
  query: string;
  setQuery: (value: string) => void;
  nodes: MemoryNode[];
  selectedNodeId: string;
  setSelectedNodeId: (value: string) => void;
  selectedNode: Record<string, unknown> | null;
  editBody: string;
  setEditBody: (value: string) => void;
  preview: Record<string, unknown> | null;
  inbox: Record<string, unknown> | null;
  selectedInboxId: string;
  setSelectedInboxId: (value: string) => void;
  inboxEditBody: string;
  setInboxEditBody: (value: string) => void;
  improvePrompt: string;
  setImprovePrompt: (value: string) => void;
  mergeTargetId: string;
  mergeSourceId: string;
  suppressReason: string;
  setMergeTargetId: (value: string) => void;
  setMergeSourceId: (value: string) => void;
  setSuppressReason: (value: string) => void;
  batchText: string;
  setBatchText: (value: string) => void;
  onLoad: () => void;
  onLoadNode: (id?: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onImprove: () => void;
  onLoadInbox: () => void;
  onInboxAction: (action: "accept" | "reject") => void;
  onSuppress: () => void;
  onUnsuppress: () => void;
  onMerge: (preview: boolean) => void;
  onBatch: (preview: boolean) => void;
}) {
  return (
    <section className="browser-workspace memory-workspace">
      <div className="panel browser-hero">
        <div>
          <p className="label">Memory Browser</p>
          <h3>Find, inspect, and improve MagGraph memories.</h3>
          <p>Search memories on the left, edit the selected node in the center, and keep inbox or merge workflows tucked into focused drawers.</p>
        </div>
        <div className="browser-stats">
          <div>
            <p className="label">Loaded</p>
            <strong>{props.nodes.length}</strong>
          </div>
          <div>
            <p className="label">Selected</p>
            <strong>{props.selectedNodeId ? "Yes" : "No"}</strong>
          </div>
          <div>
            <p className="label">Preview</p>
            <strong>{props.preview ? "Ready" : "None"}</strong>
          </div>
        </div>
      </div>

      <div className="browser-grid memory-browser-grid">
        <div className="panel browser-sidebar">
          <div className="panel-heading">
            <h3>Browse</h3>
            <Brain size={20} />
          </div>
          <div className="control-row">
            <input id="memory-query" value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search memories, tags, or project facts" />
            <button className="primary-action compact-action" onClick={props.onLoad} disabled={props.busy} type="button">
              <Search size={16} />
              <span>Search</span>
            </button>
          </div>
          <MiniGraph nodes={props.nodes} selectedNodeId={props.selectedNodeId} />
          <MemoryNodeList nodes={props.nodes} selectedNodeId={props.selectedNodeId} setSelectedNodeId={props.setSelectedNodeId} onLoadNode={props.onLoadNode} />
        </div>

        <div className="panel browser-main">
          <div className="panel-heading">
            <h3>{props.selectedNodeId ? "Selected Memory" : "Select a Memory"}</h3>
            <Search size={20} />
          </div>
          <div className="control-row">
            <input id="node-id" value={props.selectedNodeId} onChange={(event) => props.setSelectedNodeId(event.target.value)} placeholder="Paste a node ID to inspect directly" />
            <button className="icon-action" onClick={() => props.onLoadNode()} disabled={props.busy || !props.selectedNodeId} type="button">
              <RefreshCcw size={16} />
              <span>Inspect</span>
            </button>
          </div>
          <MemoryProvenance node={props.selectedNode} />
          <label htmlFor="memory-body">Memory Markdown</label>
          <textarea className="memory-editor" id="memory-body" value={props.editBody} onChange={(event) => props.setEditBody(event.target.value)} placeholder="Select a node to inspect or edit its Markdown body." />
          <div className="row-actions">
            <button className="icon-action" onClick={props.onPreview} disabled={props.busy || !props.selectedNodeId} type="button">
              <Search size={16} />
              <span>Preview</span>
            </button>
            <button className="primary-action" onClick={props.onApply} disabled={props.busy || !props.selectedNodeId} type="button">
              <Save size={18} />
              <span>Apply</span>
            </button>
            <button className="icon-action" onClick={props.onImprove} disabled={props.busy || !props.selectedNodeId} type="button">
              <Sparkles size={16} />
              <span>Improve in Chat</span>
            </button>
          </div>
          {props.preview && (
            <details className="inline-details" open>
              <summary>Preview result</summary>
              <pre>{JSON.stringify(props.preview, null, 2)}</pre>
            </details>
          )}
        </div>

        <div className="browser-side-stack">
          <MemoryInbox
            inbox={props.inbox}
            selectedId={props.selectedInboxId}
            setSelectedId={props.setSelectedInboxId}
            editBody={props.inboxEditBody}
            setEditBody={props.setInboxEditBody}
            busy={props.busy}
            onLoad={props.onLoadInbox}
            onAction={props.onInboxAction}
          />
          <details className="panel inline-details" open>
            <summary>Memory Actions</summary>
            <div className="stack">
              <label htmlFor="memory-improve">Improve prompt</label>
              <input id="memory-improve" value={props.improvePrompt} onChange={(event) => props.setImprovePrompt(event.target.value)} />
              <label htmlFor="suppress-reason">Suppress reason</label>
              <input id="suppress-reason" value={props.suppressReason} onChange={(event) => props.setSuppressReason(event.target.value)} />
              <div className="row-actions">
                <button className="icon-action" onClick={props.onSuppress} disabled={props.busy || !props.selectedNodeId} type="button">
                  <ShieldCheck size={16} />
                  <span>Suppress</span>
                </button>
                <button className="icon-action" onClick={props.onUnsuppress} disabled={props.busy || !props.selectedNodeId} type="button">
                  <RefreshCcw size={16} />
                  <span>Unsuppress</span>
                </button>
              </div>
            </div>
          </details>
          <details className="panel inline-details">
            <summary>Merge Nodes</summary>
            <div className="stack">
              <input value={props.mergeTargetId} onChange={(event) => props.setMergeTargetId(event.target.value)} placeholder="Target node ID" />
              <input value={props.mergeSourceId} onChange={(event) => props.setMergeSourceId(event.target.value)} placeholder="Source node ID" />
              <div className="row-actions">
                <button className="icon-action" onClick={() => props.onMerge(true)} disabled={props.busy} type="button">
                  <Search size={16} />
                  <span>Preview</span>
                </button>
                <button className="primary-action" onClick={() => props.onMerge(false)} disabled={props.busy} type="button">
                  <Save size={18} />
                  <span>Merge</span>
                </button>
              </div>
            </div>
          </details>
          <details className="panel inline-details">
            <summary>Reviewed Batch</summary>
            <div className="stack">
              <p className="muted">Preview several update, suppress, unsuppress, or merge operations as one reviewed change.</p>
              <textarea
                className="batch-editor"
                value={props.batchText}
                onChange={(event) => props.setBatchText(event.target.value)}
                aria-label="Memory batch operations JSON"
              />
              <div className="row-actions">
                <button className="icon-action" onClick={() => props.onBatch(true)} disabled={props.busy} type="button">
                  <Search size={16} />
                  <span>Preview Batch</span>
                </button>
                <button className="primary-action" onClick={() => props.onBatch(false)} disabled={props.busy} type="button">
                  <Save size={18} />
                  <span>Apply Batch</span>
                </button>
              </div>
            </div>
          </details>
          <details className="panel inline-details">
            <summary>Raw Node JSON</summary>
            <pre>{props.selectedNode ? JSON.stringify(props.selectedNode, null, 2) : "Select or enter a node ID."}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}

function MemoryNodeList(props: {
  nodes: MemoryNode[];
  selectedNodeId: string;
  setSelectedNodeId: (value: string) => void;
  onLoadNode: (id?: string) => void;
}) {
  return (
    <div className="node-list browser-list">
      {props.nodes.length ? (
        props.nodes.map((node) => {
          const id = String(node.id ?? node.path ?? "");
          return (
            <button
              className={props.selectedNodeId === id ? "list-button active-item" : "list-button"}
              key={id}
              onClick={() => {
                props.setSelectedNodeId(id);
                props.onLoadNode(id);
              }}
              type="button"
            >
              <strong>{node.title ?? node.id ?? "Memory node"}</strong>
              <span>{node.type ?? node.path ?? id}</span>
            </button>
          );
        })
      ) : (
        <p className="muted">Search memories to browse graph nodes.</p>
      )}
    </div>
  );
}

function MemoryInbox(props: {
  inbox: Record<string, unknown> | null;
  selectedId: string;
  setSelectedId: (value: string) => void;
  editBody: string;
  setEditBody: (value: string) => void;
  busy: boolean;
  onLoad: () => void;
  onAction: (action: "accept" | "reject") => void;
}) {
  const candidates = extractRows(props.inbox);
  return (
    <details className="panel inline-details" open>
      <summary>Memory Inbox</summary>
      <div className="panel-heading">
        <h3>Promote Candidates</h3>
        <ClipboardList size={18} />
      </div>
      <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
        <RefreshCcw size={16} />
        <span>Load Inbox</span>
      </button>
      <input value={props.selectedId} onChange={(event) => props.setSelectedId(event.target.value)} placeholder="Candidate ID" />
      <textarea value={props.editBody} onChange={(event) => props.setEditBody(event.target.value)} placeholder="Edit candidate before promoting, or use this as a rewrite scratchpad." />
      <div className="row-actions">
        <button className="icon-action" onClick={() => props.onAction("accept")} disabled={props.busy || !props.selectedId} type="button">
          <CheckCircle2 size={16} />
          <span>Accept</span>
        </button>
        <button className="icon-action" onClick={() => props.onAction("reject")} disabled={props.busy || !props.selectedId} type="button">
          <XCircle size={16} />
          <span>Reject</span>
        </button>
      </div>
      <div className="node-list compact-list">
        {candidates.length ? (
          candidates.map((candidate, index) => {
            const id = String(candidate.id ?? candidate.candidate_id ?? index);
            return (
              <button
                className="list-button compact"
                key={id}
                onClick={() => {
                  props.setSelectedId(id);
                  props.setEditBody(String(candidate.body ?? candidate.content ?? candidate.summary ?? ""));
                }}
                type="button"
              >
                <strong>{id}</strong>
                <span>{String(candidate.summary ?? candidate.reason ?? candidate.source ?? "")}</span>
              </button>
            );
          })
        ) : (
          <p className="muted">Pending memory candidates appear here.</p>
        )}
      </div>
    </details>
  );
}

function MiniGraph(props: { nodes: MemoryNode[]; selectedNodeId: string }) {
  const nodes = props.nodes.slice(0, 18);
  return (
    <div className="mini-graph" aria-label="Memory graph preview">
      {nodes.length ? (
        nodes.map((node, index) => {
          const id = String(node.id ?? node.path ?? index);
          return (
            <div
              className={props.selectedNodeId === id ? "graph-node active" : "graph-node"}
              key={id}
              style={{ gridColumn: `${(index % 6) + 1}`, gridRow: `${Math.floor(index / 6) + 1}` }}
              title={id}
            >
              {String(node.type ?? "m").slice(0, 2)}
            </div>
          );
        })
      ) : (
        <p className="muted">Graph preview appears after loading memory.</p>
      )}
    </div>
  );
}

export function MemoryProvenance(props: { node: Record<string, unknown> | null }) {
  if (!props.node) return <p className="muted">Inspect a node to see backlinks, links, and provenance.</p>;
  const links = listFromUnknown(props.node.links);
  const backlinks = listFromUnknown(props.node.backlinks);
  const provenance = props.node.provenance ?? props.node.metadata;
  const reasons = listFromUnknown(props.node.reasons ?? props.node.relevance_reasons);
  const scores = props.node.score_breakdown ?? props.node.scores;
  return (
    <div className="memory-evidence">
      <div className="provenance-grid">
        <div><p className="label">Links</p><strong>{links.length}</strong></div>
        <div><p className="label">Backlinks</p><strong>{backlinks.length}</strong></div>
        <div><p className="label">Provenance</p><span>{provenance ? "Available" : "Not provided"}</span></div>
      </div>
      {reasons.length > 0 && <p className="recall-reasons"><strong>Why recalled:</strong> {reasons.join(" · ")}</p>}
      {scores !== undefined && <details className="score-details"><summary>Retrieval score</summary><pre>{JSON.stringify(scores, null, 2)}</pre></details>}
    </div>
  );
}
