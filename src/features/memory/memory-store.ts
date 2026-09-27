import { create } from "zustand";
import { measurePerformance } from "../../lib/performance";
import { getNodeBody } from "../../lib/utils";
import { useAppStore } from "../../stores/app-store";
import { executeCommand, executeJson } from "../../stores/magent-actions";
import { useChatStore } from "../chat/chat-store";

type Json = Record<string, unknown> | null;

export type MemoryState = {
  query: string;
  graph: Json;
  selectedNodeId: string;
  selectedNode: Json;
  editBody: string;
  preview: Json;
  inbox: Json;
  selectedInboxId: string;
  inboxEditBody: string;
  improvePrompt: string;
  mergeTargetId: string;
  mergeSourceId: string;
  suppressReason: string;
  batchText: string;
};

export const useMemoryStore = create<
  MemoryState & { set: (partial: Partial<MemoryState>) => void }
>()((set) => ({
  query: "",
  graph: null,
  selectedNodeId: "",
  selectedNode: null,
  editBody: "",
  preview: null,
  inbox: null,
  selectedInboxId: "",
  inboxEditBody: "",
  improvePrompt:
    "Improve this memory for clarity, remove duplication, and preserve useful provenance.",
  mergeTargetId: "",
  mergeSourceId: "",
  suppressReason: "Reviewed from Mag Command Center",
  batchText: '[\n  { "action": "suppress", "node_id": "" }\n]',
  set: (partial) => set(partial),
}));

const memory = () => useMemoryStore.getState();

export async function loadMemoryGraph() {
  const query = memory().query.trim();
  const args = ["memory", "graph", "--limit", "80"];
  if (query) args.push("--query", query);
  await measurePerformance("memory.search", () =>
    executeJson<Record<string, unknown>>(args, (data) =>
      memory().set({ graph: data, selectedNode: null, preview: null }),
    ),
  );
}

export async function loadMemoryInbox() {
  await executeJson<Record<string, unknown>>(
    ["memory", "inbox", "--json"],
    (data) => memory().set({ inbox: data }),
  );
}

export async function updateMemoryInbox(action: "accept" | "reject") {
  const id = memory().selectedInboxId.trim();
  if (!id) return;
  await executeCommand(["memory", "inbox", action, id], loadMemoryInbox);
}

export async function loadMemoryNode(id = memory().selectedNodeId) {
  if (!id.trim()) return;
  await executeJson<Record<string, unknown>>(
    ["memory", "node", id.trim()],
    (data) =>
      memory().set({
        selectedNode: data,
        editBody: getNodeBody(data),
        preview: null,
      }),
  );
}

export async function previewMemoryUpdate() {
  const id = memory().selectedNodeId.trim();
  if (!id) return;
  await executeJson<Record<string, unknown>>(
    ["memory", "update-node", id, "--preview", "--body", memory().editBody],
    (data) => memory().set({ preview: data }),
  );
}

export async function applyMemoryUpdate() {
  const id = memory().selectedNodeId.trim();
  if (!id) return;
  await executeJson<Record<string, unknown>>(
    ["memory", "update-node", id, "--body", memory().editBody],
    (data) => {
      memory().set({ preview: data });
      void loadMemoryNode(memory().selectedNodeId);
    },
  );
}

export function askToImproveMemory() {
  const { selectedNodeId, improvePrompt, editBody } = memory();
  if (!selectedNodeId.trim()) return;
  useAppStore.getState().set({ view: "chat" });
  useChatStore.getState().set({
    prompt: `${improvePrompt}\n\nNode ID: ${selectedNodeId}\n\nCurrent body:\n${editBody}`,
  });
}

export async function suppressMemoryNode() {
  const { selectedNodeId, suppressReason } = memory();
  if (!selectedNodeId.trim()) return;
  await executeCommand([
    "memory",
    "suppress",
    selectedNodeId.trim(),
    "--reason",
    suppressReason,
  ]);
  await loadMemoryNode(selectedNodeId);
}

export async function unsuppressMemoryNode() {
  const { selectedNodeId } = memory();
  if (!selectedNodeId.trim()) return;
  await executeCommand(["memory", "unsuppress", selectedNodeId.trim()]);
  await loadMemoryNode(selectedNodeId);
}

export async function mergeMemoryNodes(preview: boolean) {
  const target = memory().mergeTargetId.trim();
  const source = memory().mergeSourceId.trim();
  if (!target || !source) return;
  const args = ["memory", "merge", target, source];
  if (preview) args.push("--preview");
  await executeCommand(args, loadMemoryGraph);
}

export async function applyMemoryBatch(preview: boolean) {
  let operations: unknown;
  try {
    operations = JSON.parse(memory().batchText);
    if (!Array.isArray(operations))
      throw new Error("Batch must be a JSON array.");
  } catch (reason) {
    useAppStore
      .getState()
      .notify(
        reason instanceof Error ? reason.message : "Invalid batch JSON",
        "bad",
      );
    return;
  }
  const args = [
    "memory",
    "batch",
    "--operations-json",
    JSON.stringify(operations),
  ];
  if (preview) args.push("--preview");
  await executeJson<Record<string, unknown>>(args, (data) => {
    memory().set({ preview: data });
    if (!preview) void loadMemoryGraph();
  });
}
