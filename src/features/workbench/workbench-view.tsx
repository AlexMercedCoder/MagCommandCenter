import { useRuntimes } from "../../app/runtime-context";
import { WorkbenchPanel } from "../../components/workbench-panel";
import { useAppStore } from "../../stores/app-store";
import { useChatRuntime } from "../chat/use-chat-runtime";
import {
  chooseGraphFile,
  inspectGraph,
  inspectPatch,
  listRecipes,
  runGraph,
  runRecipe,
  useWorkbenchStore,
} from "./workbench-store";

export function WorkbenchView() {
  const busy = useAppStore((state) => state.busy);
  const project = useAppStore((state) => state.project);
  const commandHistory = useAppStore((state) => state.commandHistory);
  const bench = useWorkbenchStore();
  const { workbench } = useRuntimes();
  const { activeProfile } = useChatRuntime();
  return (
    <WorkbenchPanel
      busy={busy}
      project={project}
      recipeName={bench.recipeName}
      setRecipeName={(recipeName) => bench.set({ recipeName })}
      graphPath={bench.graphPath}
      setGraphPath={(graphPath) => bench.set({ graphPath })}
      graphActivity={bench.graphActivity}
      result={bench.result}
      commandHistory={commandHistory}
      checkpoints={workbench.checkpoints}
      selectedCheckpoint={workbench.selectedCheckpoint}
      checkpointDiff={workbench.checkpointDiff}
      peers={workbench.peers}
      peerTarget={workbench.peerTarget}
      peerMessage={workbench.peerMessage}
      setPeerTarget={workbench.setPeerTarget}
      setPeerMessage={workbench.setPeerMessage}
      onListRecipes={listRecipes}
      onRunRecipe={(name) => runRecipe(activeProfile, name)}
      onInspectPatch={inspectPatch}
      onChooseGraph={chooseGraphFile}
      onValidateGraph={() => inspectGraph("validate")}
      onPlanGraph={() => inspectGraph("plan")}
      onRunGraph={() => runGraph(activeProfile)}
      onLoadCheckpoints={workbench.loadCheckpoints}
      onInspectCheckpoint={workbench.inspectCheckpoint}
      onRestoreCheckpoint={workbench.restoreCheckpoint}
      onLoadPeers={workbench.loadPeers}
      onSendPeerMessage={workbench.sendPeerMessage}
    />
  );
}
