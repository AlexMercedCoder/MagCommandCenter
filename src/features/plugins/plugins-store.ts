import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { executeCommand, executeJson } from "../../stores/magent-actions";

type Json = Record<string, unknown> | null;

export type PluginsState = {
  plugins: Json;
  name: string;
  source: string;
  importKind: string;
  review: Json;
};

export const usePluginsStore = create<
  PluginsState & { set: (partial: Partial<PluginsState>) => void }
>()((set) => ({
  plugins: null,
  name: "",
  source: "",
  importKind: "codex-skill",
  review: null,
  set: (partial) => set(partial),
}));

const plugins = () => usePluginsStore.getState();

export async function choosePluginSource() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select plugin pack",
  });
  if (typeof selected === "string") plugins().set({ source: selected });
}

export async function loadPlugins() {
  await executeJson<Record<string, unknown>>(
    ["plugin", "list", "--json"],
    (data) => plugins().set({ plugins: data }),
  );
}

export async function reviewPlugin() {
  const name = plugins().name.trim();
  const source = plugins().source.trim();
  const kind = plugins().importKind;
  if (name) {
    await executeJson<Record<string, unknown>>(
      ["plugin", "explain", name, "--json"],
      (data) => plugins().set({ review: data }),
    );
    return;
  }
  if (!source) return;
  const args =
    kind === "mcp"
      ? ["plugin", "mcp", "import", source, "--dry-run", "--json"]
      : ["plugin", "import", kind, source, "--dry-run", "--json"];
  await executeJson<Record<string, unknown>>(args, (data) =>
    plugins().set({ review: data }),
  );
}

export async function updatePlugin(enabled: boolean) {
  const name = plugins().name.trim();
  if (!name) return;
  await executeCommand(
    ["plugin", enabled ? "enable" : "disable", name],
    loadPlugins,
  );
}

export async function installPlugin() {
  const name = plugins().name.trim();
  const source = plugins().source.trim();
  if (!source) return;
  const args = ["plugin", "install", source];
  if (name) args.push("--name", name);
  await executeCommand(args, loadPlugins);
}

export async function importPlugin() {
  const name = plugins().name.trim();
  const source = plugins().source.trim();
  const kind = plugins().importKind;
  if (!source) return;
  const args =
    kind === "mcp"
      ? ["plugin", "mcp", "import", source]
      : ["plugin", "import", kind, source];
  if (name) args.push("--name", name);
  await executeCommand(args, loadPlugins);
}
