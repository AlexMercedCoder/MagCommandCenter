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
}) {
  return (
    <section className="two-column memory-layout">
      <div className="panel">
        <div className="panel-heading">
          <h3>Memory Graph</h3>
          <Brain size={20} />
        </div>
        <div className="stack">
          <label htmlFor="memory-query">Search</label>
          <input id="memory-query" value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
          <button className="icon-action" onClick={props.onLoad} disabled={props.busy} type="button">
            <Search size={16} />
            <span>Load Graph</span>
          </button>
          <MiniGraph nodes={props.nodes} selectedNodeId={props.selectedNodeId} />
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
          <div className="node-list">
            {props.nodes.length ? (
              props.nodes.map((node) => {
                const id = String(node.id ?? node.path ?? "");
                return (
                  <button
                    className="list-button"
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
              <p className="muted">Load memory to browse graph nodes.</p>
            )}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h3>Node Editor</h3>
          <Search size={20} />
        </div>
        <div className="stack">
          <label htmlFor="node-id">Node ID</label>
          <input id="node-id" value={props.selectedNodeId} onChange={(event) => props.setSelectedNodeId(event.target.value)} />
          <button className="icon-action" onClick={() => props.onLoadNode()} disabled={props.busy} type="button">
            <RefreshCcw size={16} />
            <span>Inspect</span>
          </button>
          <MemoryProvenance node={props.selectedNode} />
          <label htmlFor="memory-body">Markdown body</label>
          <textarea id="memory-body" value={props.editBody} onChange={(event) => props.setEditBody(event.target.value)} />
          <label htmlFor="memory-improve">Memory improvement prompt</label>
          <input id="memory-improve" value={props.improvePrompt} onChange={(event) => props.setImprovePrompt(event.target.value)} />
          <div className="row-actions">
            <button className="icon-action" onClick={props.onPreview} disabled={props.busy || !props.selectedNodeId} type="button">
              <Search size={16} />
              <span>Preview Edit</span>
            </button>
            <button className="primary-action" onClick={props.onApply} disabled={props.busy || !props.selectedNodeId} type="button">
              <Save size={18} />
              <span>Apply Edit</span>
            </button>
            <button className="icon-action" onClick={props.onImprove} disabled={props.busy || !props.selectedNodeId} type="button">
              <Sparkles size={16} />
              <span>Improve in Chat</span>
            </button>
          </div>
          <pre>{props.preview ? JSON.stringify(props.preview, null, 2) : "Preview returns old/new hashes before writing."}</pre>
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
          <div className="merge-box">
            <h3>Merge Nodes</h3>
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
          <JsonPanel title="Raw Node" icon={<Brain size={20} />} value={props.selectedNode} empty="Select or enter a node ID." />
        </div>
      </div>
    </section>
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
    <div className="merge-box">
      <div className="panel-heading">
        <h3>Memory Inbox</h3>
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
    </div>
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

function MemoryProvenance(props: { node: Record<string, unknown> | null }) {
  if (!props.node) return <p className="muted">Inspect a node to see backlinks, links, and provenance.</p>;
  const links = listFromUnknown(props.node.links);
  const backlinks = listFromUnknown(props.node.backlinks);
  const provenance = props.node.provenance ?? props.node.metadata;
  return (
    <div className="provenance-grid">
      <div>
        <p className="label">Links</p>
        <strong>{links.length}</strong>
      </div>
      <div>
        <p className="label">Backlinks</p>
        <strong>{backlinks.length}</strong>
      </div>
      <div>
        <p className="label">Provenance</p>
        <span>{provenance ? "Available" : "Not provided"}</span>
      </div>
    </div>
  );
}
