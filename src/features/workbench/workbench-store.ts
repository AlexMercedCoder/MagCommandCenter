import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { parseJson, runMagentStream } from "../../magent";
import { useAppStore } from "../../stores/app-store";
import { executeJson } from "../../stores/magent-actions";

export type WorkbenchState = {
  recipeName: string;
  graphPath: string;
  graphActivity: string[];
  result: Record<string, unknown> | null;
};

export const useWorkbenchStore = create<
  WorkbenchState & { set: (partial: Partial<WorkbenchState>) => void }
>()((set) => ({
  recipeName: "docs-audit",
  graphPath: "",
  graphActivity: [],
  result: null,
  set: (partial) => set(partial),
}));

const workbench = () => useWorkbenchStore.getState();
const app = () => useAppStore.getState();
const setResult = (data: Record<string, unknown> | null) =>
  workbench().set({ result: data });

export async function runRecipe(
  profile: string,
  name = workbench().recipeName,
) {
  await executeJson<Record<string, unknown>>(
    [
      "recipe",
      "run",
      name,
      "--project",
      app().project,
      "--agent",
      profile,
      "--json",
    ],
    setResult,
  );
}

export async function listRecipes() {
  await executeJson<Record<string, unknown>>(
    ["recipe", "list", "--project", app().project, "--json"],
    setResult,
  );
}

export async function inspectPatch() {
  await executeJson<Record<string, unknown>>(
    ["project", "patch", "--project", app().project, "--json"],
    setResult,
  );
}

export async function chooseGraphFile() {
  const selected = await open({
    directory: false,
    multiple: false,
    title: "Open Agentic Graph",
    filters: [{ name: "Agentic Graph", extensions: ["yaml", "yml", "json"] }],
  });
  if (typeof selected === "string") workbench().set({ graphPath: selected });
}

export async function inspectGraph(action: "validate" | "plan") {
  const path = workbench().graphPath.trim();
  if (!path) return;
  const args = ["graph", action, path, "--json"];
  if (action === "validate") args.splice(3, 0, "--strict");
  await executeJson<Record<string, unknown>>(args, setResult);
}

export async function runGraph(profile: string) {
  const path = workbench().graphPath.trim();
  if (!path) return;
  const approved = window.confirm(
    "Run this reviewed graph and approve all of its declared human gates and checkpoints? Validate and review the plan first.",
  );
  if (!approved) return;
  app().setBusy(true);
  workbench().set({ graphActivity: [] });
  try {
    const result = await runMagentStream(
      [
        "graph",
        "run",
        path,
        "--project",
        app().project,
        "--agent",
        profile,
        "--json",
      ],
      (event) =>
        workbench().set({
          graphActivity: [...workbench().graphActivity.slice(-199), event.line],
        }),
    );
    app().recordCommand(result);
    setResult(parseJson<Record<string, unknown>>(result));
  } catch (reason) {
    app().notify(
      reason instanceof Error
        ? reason.message
        : "Graph execution failed to start",
      "bad",
    );
  } finally {
    app().setBusy(false);
  }
}
