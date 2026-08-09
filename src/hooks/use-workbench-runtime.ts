import { useState } from "react";
import type { Checkpoint, SessionPeer, Toast } from "../lib/types";
import { magentClient } from "../magent";

type Options = {
  setBusy: (busy: boolean) => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
  onResult: (result: Record<string, unknown>) => void;
};

export function useWorkbenchRuntime(project: string, options: Options) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState("");
  const [checkpointDiff, setCheckpointDiff] = useState("");
  const [peers, setPeers] = useState<SessionPeer[]>([]);
  const [peerTarget, setPeerTarget] = useState("");
  const [peerMessage, setPeerMessage] = useState("");

  async function run(operation: () => Promise<void>) {
    options.setBusy(true);
    try {
      await operation();
    } catch (reason) {
      options.notify(reason instanceof Error ? reason.message : String(reason), "bad");
    } finally {
      options.setBusy(false);
    }
  }

  async function loadCheckpoints() {
    await run(async () => {
      const items = await magentClient.checkpoints();
      const projectItems = items.filter((item) => !item.path || item.path.startsWith(project));
      setCheckpoints(projectItems);
      options.notify(`Loaded ${projectItems.length} project checkpoints`, "good");
    });
  }

  async function inspectCheckpoint(checkpointId: string) {
    await run(async () => {
      const result = await magentClient.checkpointDiff(checkpointId);
      setSelectedCheckpoint(checkpointId);
      setCheckpointDiff(String(result.diff ?? "No changes from this checkpoint."));
    });
  }

  async function restoreCheckpoint(checkpointId: string) {
    if (!window.confirm("Restore this file to its checkpointed state? Current changes to that file will be replaced.")) return;
    await run(async () => {
      const result = await magentClient.restoreCheckpoint(checkpointId);
      options.onResult(result);
      setCheckpointDiff("");
      options.notify("Checkpoint restored", "good");
      const items = await magentClient.checkpoints();
      setCheckpoints(items.filter((item) => !item.path || item.path.startsWith(project)));
    });
  }

  async function loadPeers() {
    await run(async () => {
      const items = await magentClient.sessionPeers();
      setPeers(items);
      if (!peerTarget && items.length) setPeerTarget(items[0].session_id || items[0].id || "");
      options.notify(`Found ${items.length} live sessions`, items.length ? "good" : "info");
    });
  }

  async function sendPeerMessage() {
    if (!peerTarget || !peerMessage.trim()) return;
    await run(async () => {
      options.onResult(await magentClient.sendSessionMessage(peerTarget, peerMessage.trim()));
      setPeerMessage("");
      options.notify("Coordination message sent", "good");
    });
  }

  return {
    checkpoints,
    selectedCheckpoint,
    checkpointDiff,
    peers,
    peerTarget,
    peerMessage,
    setPeerTarget,
    setPeerMessage,
    loadCheckpoints,
    inspectCheckpoint,
    restoreCheckpoint,
    loadPeers,
    sendPeerMessage
  };
}
