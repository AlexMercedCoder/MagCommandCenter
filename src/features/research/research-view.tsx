import { ResearchPanel } from "../../components/research-panel";
import { useAppStore } from "../../stores/app-store";
import { useChatRuntime } from "../chat/use-chat-runtime";
import { runResearch, useResearchStore } from "./research-store";

export function ResearchView() {
  const busy = useAppStore((state) => state.busy);
  const research = useResearchStore();
  const { activeProfile } = useChatRuntime();
  return (
    <ResearchPanel
      busy={busy}
      topic={research.topic}
      question={research.question}
      result={research.result}
      setTopic={(topic) => research.set({ topic })}
      setQuestion={(question) => research.set({ question })}
      onRun={() => runResearch(activeProfile)}
    />
  );
}
