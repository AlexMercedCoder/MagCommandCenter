import { useMemo } from "react";
import { MemoryPanel } from "../../components/memory-panel";
import { extractNodes } from "../../lib/utils";
import { useAppStore } from "../../stores/app-store";
import {
  applyMemoryBatch,
  applyMemoryUpdate,
  askToImproveMemory,
  loadMemoryGraph,
  loadMemoryInbox,
  loadMemoryNode,
  mergeMemoryNodes,
  previewMemoryUpdate,
  suppressMemoryNode,
  unsuppressMemoryNode,
  updateMemoryInbox,
  useMemoryStore,
} from "./memory-store";

export function MemoryView() {
  const busy = useAppStore((state) => state.busy);
  const memory = useMemoryStore();
  const nodes = useMemo(() => extractNodes(memory.graph), [memory.graph]);
  const set = memory.set;
  return (
    <MemoryPanel
      busy={busy}
      query={memory.query}
      setQuery={(query) => set({ query })}
      nodes={nodes}
      selectedNodeId={memory.selectedNodeId}
      setSelectedNodeId={(selectedNodeId) => set({ selectedNodeId })}
      selectedNode={memory.selectedNode}
      editBody={memory.editBody}
      setEditBody={(editBody) => set({ editBody })}
      preview={memory.preview}
      inbox={memory.inbox}
      selectedInboxId={memory.selectedInboxId}
      setSelectedInboxId={(selectedInboxId) => set({ selectedInboxId })}
      inboxEditBody={memory.inboxEditBody}
      setInboxEditBody={(inboxEditBody) => set({ inboxEditBody })}
      improvePrompt={memory.improvePrompt}
      setImprovePrompt={(improvePrompt) => set({ improvePrompt })}
      mergeTargetId={memory.mergeTargetId}
      mergeSourceId={memory.mergeSourceId}
      suppressReason={memory.suppressReason}
      setMergeTargetId={(mergeTargetId) => set({ mergeTargetId })}
      setMergeSourceId={(mergeSourceId) => set({ mergeSourceId })}
      setSuppressReason={(suppressReason) => set({ suppressReason })}
      batchText={memory.batchText}
      setBatchText={(batchText) => set({ batchText })}
      onLoad={loadMemoryGraph}
      onLoadNode={loadMemoryNode}
      onPreview={previewMemoryUpdate}
      onApply={applyMemoryUpdate}
      onImprove={askToImproveMemory}
      onLoadInbox={loadMemoryInbox}
      onInboxAction={updateMemoryInbox}
      onSuppress={suppressMemoryNode}
      onUnsuppress={unsuppressMemoryNode}
      onMerge={mergeMemoryNodes}
      onBatch={applyMemoryBatch}
    />
  );
}
