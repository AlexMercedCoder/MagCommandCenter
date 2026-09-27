import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { initialAppState, useAppStore } from "../stores/app-store";
import { executeCommand, executeJson } from "../stores/magent-actions";
import { runMagentStream } from "../magent";
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
} from "./memory/memory-store";
import {
  loadSqliteDbs,
  loadSqliteTables,
  runSqliteQuery,
  saveSqliteQuery,
  useSqliteStore,
} from "./sqlite/sqlite-store";
import {
  choosePluginSource,
  importPlugin,
  installPlugin,
  loadPlugins,
  reviewPlugin,
  updatePlugin,
  usePluginsStore,
} from "./plugins/plugins-store";
import {
  loadConfig,
  saveConfigValue,
  useConfigStore,
} from "./config/config-store";
import { runResearch, useResearchStore } from "./research/research-store";
import {
  chooseGraphFile,
  inspectGraph,
  inspectPatch,
  listRecipes,
  runGraph,
  runRecipe,
  useWorkbenchStore,
} from "./workbench/workbench-store";
import { useChatStore } from "./chat/chat-store";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../magent", async (original) => ({
  ...(await original<typeof import("../magent")>()),
  runMagentStream: vi.fn(),
}));
vi.mock("../stores/magent-actions", () => ({
  executeJson: vi.fn(async (_args: string[], onData: (d: unknown) => void) =>
    onData({ ok: true, fields: [{ path: "a.b", value: 1 }] }),
  ),
  executeCommand: vi.fn(async (_args: string[], after?: () => void) =>
    after?.(),
  ),
}));

const json = vi.mocked(executeJson);
const command = vi.mocked(executeCommand);
const calls = () => [
  ...json.mock.calls.map((call) => call[0].join(" ")),
  ...command.mock.calls.map((call) => call[0].join(" ")),
];

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ ...initialAppState(), project: "/work/p" });
});

describe("memory store", () => {
  it("builds memory commands from the current selection", async () => {
    useMemoryStore.getState().set({
      query: "release",
      selectedNodeId: "n1",
      editBody: "body",
      selectedInboxId: "c1",
      mergeTargetId: "t",
      mergeSourceId: "s",
      batchText: '[{"action":"suppress","node_id":"n1"}]',
    });
    await loadMemoryGraph();
    await loadMemoryInbox();
    await updateMemoryInbox("accept");
    await loadMemoryNode();
    useMemoryStore.getState().set({ editBody: "body" });
    await previewMemoryUpdate();
    await applyMemoryUpdate();
    await suppressMemoryNode();
    await unsuppressMemoryNode();
    await mergeMemoryNodes(true);
    await applyMemoryBatch(true);
    expect(calls()).toEqual(
      expect.arrayContaining([
        "memory graph --limit 80 --query release",
        "memory inbox --json",
        "memory inbox accept c1",
        "memory node n1",
        "memory update-node n1 --preview --body body",
        "memory update-node n1 --body body",
        "memory suppress n1 --reason Reviewed from Mag Command Center",
        "memory unsuppress n1",
        "memory merge t s --preview",
        'memory batch --operations-json [{"action":"suppress","node_id":"n1"}] --preview',
      ]),
    );
  });

  it("rejects batch text that is not a JSON array", async () => {
    useMemoryStore.getState().set({ batchText: "{}" });
    await applyMemoryBatch(false);
    expect(useAppStore.getState().toasts[0].text).toBe(
      "Batch must be a JSON array.",
    );
  });

  it("hands a memory to chat for improvement", () => {
    useMemoryStore.getState().set({ selectedNodeId: "n1", editBody: "old" });
    askToImproveMemory();
    expect(useAppStore.getState().view).toBe("chat");
    expect(useChatStore.getState().prompt).toContain("Node ID: n1");
  });
});

describe("sqlite, plugins, config, research, and workbench stores", () => {
  it("drafts SQLite commands and keeps saved queries unique", async () => {
    json.mockImplementationOnce(async (_args, onData) =>
      onData({ databases: [{ path: "/db/one.sqlite" }] }, {} as never),
    );
    await loadSqliteDbs();
    expect(useSqliteStore.getState().selectedDb).toBe("/db/one.sqlite");
    await loadSqliteTables();
    await runSqliteQuery();
    useSqliteStore.getState().set({ query: "select 1" });
    saveSqliteQuery();
    saveSqliteQuery();
    expect(useSqliteStore.getState().savedQueries).toEqual(["select 1"]);
    expect(calls()).toContain("data sqlite-tables /db/one.sqlite");
  });

  it("reviews, installs, imports, and toggles plugins", async () => {
    vi.mocked(open).mockResolvedValue("/packs/mine");
    await choosePluginSource();
    usePluginsStore.getState().set({ importKind: "mcp" });
    await reviewPlugin();
    await installPlugin();
    await importPlugin();
    usePluginsStore.getState().set({ name: "mine" });
    await reviewPlugin();
    await updatePlugin(false);
    await loadPlugins();
    expect(calls()).toEqual(
      expect.arrayContaining([
        "plugin mcp import /packs/mine --dry-run --json",
        "plugin install /packs/mine",
        "plugin mcp import /packs/mine",
        "plugin explain mine --json",
        "plugin disable mine",
        "plugin list --json",
      ]),
    );
  });

  it("loads the config schema into editable values and saves one", async () => {
    await loadConfig();
    expect(useConfigStore.getState().values).toEqual({ "a.b": "1" });
    await saveConfigValue("a.b", "2");
    expect(calls()).toContain("config set a.b 2");
  });

  it("runs research and workbench commands with the active profile", async () => {
    await runResearch("builder");
    expect(useResearchStore.getState().result).toMatchObject({ ok: true });
    await runRecipe("builder");
    await listRecipes();
    await inspectPatch();
    vi.mocked(open).mockResolvedValue("/g.yaml");
    await chooseGraphFile();
    await inspectGraph("validate");
    expect(calls()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("research Compare local coding agent"),
        "recipe run docs-audit --project /work/p --agent builder --json",
        "recipe list --project /work/p --json",
        "project patch --project /work/p --json",
        "graph validate /g.yaml --strict --json",
      ]),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(runMagentStream).mockImplementation(async (_args, onEvent) => {
      onEvent({ id: "", stream: "stdout", line: "node done" });
      return {
        ok: true,
        command: "",
        stdout: '{"ok":true}',
        stderr: "",
        status: 0,
      };
    });
    await runGraph("builder");
    expect(useWorkbenchStore.getState().graphActivity).toEqual(["node done"]);
    expect(useWorkbenchStore.getState().result).toEqual({ ok: true });
  });
});
