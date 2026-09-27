import { create } from "zustand";
import { useAppStore } from "../../stores/app-store";
import { executeJson } from "../../stores/magent-actions";

export type ResearchState = {
  topic: string;
  question: string;
  result: Record<string, unknown> | null;
};

export const useResearchStore = create<
  ResearchState & { set: (partial: Partial<ResearchState>) => void }
>()((set) => ({
  topic: "Compare local coding agent desktop app UX patterns",
  question: "memory management and project switching",
  result: null,
  set: (partial) => set(partial),
}));

export async function runResearch(profile: string) {
  const { topic, question, set } = useResearchStore.getState();
  await executeJson<Record<string, unknown>>(
    [
      "research",
      topic,
      "--question",
      question,
      "--max-sources",
      "8",
      "--project",
      useAppStore.getState().project,
      "--agent",
      profile,
    ],
    (data) => set({ result: data }),
  );
}
