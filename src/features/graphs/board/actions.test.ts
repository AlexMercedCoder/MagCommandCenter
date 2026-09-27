import { beforeEach, describe, expect, it, vi } from "vitest";
import { save } from "@tauri-apps/plugin-dialog";
import { magentClient, runMagentStream } from "../../../magent";
import { localDraftFromGoal } from "../graph-model";
import {
  applyProposal,
  applyTemplateDocument,
  blankGraph,
  controlRun,
  gatesOf,
  generate,
  isPlanStale,
  openKnown,
  previewPlan,
  propose,
  runGraph,
  saveGraph,
  togglePinnedGraph,
} from "./actions";
import { initialGraphBoardState, useGraphBoard } from "./store";
import { localDigest } from "./utils";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("../../../lib/persistence", () => ({
  loadAppState: vi.fn(async (_key: string, fallback: unknown) => fallback),
  saveAppState: vi.fn(async () => undefined),
}));
vi.mock("../../../magent", () => ({
  magentClient: {
    inspectGraph: vi.fn(),
    generateGraph: vi.fn(),
    modelGraphDraft: vi.fn(),
    saveGraph: vi.fn(),
    previewGraph: vi.fn(),
    createGraphTask: vi.fn(),
    task: vi.fn(),
    childTasks: vi.fn(),
    action: vi.fn(),
  },
  runMagentStream: vi.fn(),
  cancelMagentStream: vi.fn(async () => true),
}));

const board = () => useGraphBoard.getState();
const notify = vi.fn();
const ctx = { project: "/work/p", notify };
const client = vi.mocked(magentClient);
const doc = () => localDraftFromGoal("Ship the release");

beforeEach(() => {
  useGraphBoard.setState(initialGraphBoardState());
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("graph board store", () => {
  it("commits edits with undo and redo, invalidating the plan", () => {
    const first = doc();
    board().replaceDocument(first, {
      baseline: null,
      path: "",
      digest: "",
      dirty: true,
    });
    expect(board().selected).toBe("inspect");
    board().set({ plan: { gates: [] }, planDigest: "x" });
    board().commit({ ...first, title: "Renamed" });
    expect(board().plan).toBeNull();
    expect(board().past).toHaveLength(1);
    board().undo();
    expect(board().document?.title).toBe(first.title);
    board().redo();
    expect(board().document?.title).toBe("Renamed");
  });

  it("reorders presentation within bounds", () => {
    board().set({ presentationOrder: ["a", "b", "c"] });
    board().movePresentation("a", 1);
    expect(board().presentationOrder).toEqual(["b", "a", "c"]);
    board().movePresentation("c", 5);
    expect(board().presentationOrder).toEqual(["b", "a", "c"]);
  });
});

describe("graph board actions", () => {
  it("creates a blank graph from the goal", () => {
    board().set({ goal: "Audit the docs." });
    blankGraph();
    expect(board().document).toMatchObject({
      id: "magent/command-center/audit-the-docs",
      title: "Audit the docs",
    });
    expect(board().dirty).toBe(true);
  });

  it("asks before discarding a dirty draft", () => {
    board().set({ dirty: true, document: doc(), goal: "x" });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    blankGraph();
    expect(board().document?.id).toBe("local/review-draft");
    applyTemplateDocument(doc());
    expect(board().path).toBe("");
  });

  it("loads a generated draft and reports model fallbacks", async () => {
    board().set({ goal: "Ship" });
    client.modelGraphDraft.mockResolvedValue({
      document: doc(),
      fallback: true,
      fallback_reason: "invalid JSON",
    } as never);
    await generate(ctx, true);
    expect(board().document?.nodes.inspect).toBeDefined();
    expect(notify.mock.calls[0][0]).toContain("invalid JSON");
    expect(board().busy).toBe(false);
    expect(board().generationStarted).toBeNull();
  });

  it("opens a known graph with a baseline and clean state", async () => {
    client.inspectGraph.mockResolvedValue({
      document: doc(),
      path: "/work/p/g.yaml",
      digest: "sha256:1",
    } as never);
    await openKnown(ctx, "/work/p/g.yaml");
    expect(board()).toMatchObject({
      path: "/work/p/g.yaml",
      digest: "sha256:1",
      dirty: false,
    });
    expect(board().baseline).toEqual(board().document);
  });

  it("saves through a dialog when the graph has no path", async () => {
    board().replaceDocument(doc(), {
      baseline: null,
      path: "",
      digest: "",
      dirty: true,
    });
    vi.mocked(save).mockResolvedValue("/work/p/new.yaml");
    client.saveGraph.mockResolvedValue({
      path: "/work/p/new.yaml",
      digest: "sha256:2",
    } as never);
    await saveGraph(ctx);
    expect(board()).toMatchObject({
      path: "/work/p/new.yaml",
      digest: "sha256:2",
      dirty: false,
      recentGraphs: ["/work/p/new.yaml"],
    });
    expect(notify).toHaveBeenCalledWith(
      "Graph saved atomically and validated",
      "good",
    );
  });

  it("binds the plan to the document digest", async () => {
    const current = doc();
    board().set({ document: current });
    client.previewGraph.mockResolvedValue({
      plan: { gates: ["review"] },
    } as never);
    await previewPlan(ctx);
    expect(board().planDigest).toBe(localDigest(current));
    expect(gatesOf(board().plan)).toEqual(["review"]);
    expect(isPlanStale()).toBe(false);
    board().set({ document: { ...current, title: "changed" } });
    expect(isPlanStale()).toBe(true);
  });

  it("applies only the selected proposal changes", async () => {
    const current = doc();
    const proposed = structuredClone(current);
    proposed.objective = "New objective";
    delete proposed.nodes.review;
    board().set({ document: current, assistantPrompt: "trim" });
    client.modelGraphDraft.mockResolvedValue({
      document: proposed,
      changes: [
        { pointer: "/objective", operation: "replace" },
        { pointer: "/nodes/review", operation: "remove" },
      ],
      model: "m",
      profile: "p",
    } as never);
    await propose(ctx);
    board().set({ proposalSelection: new Set([1]) });
    applyProposal();
    expect(board().document?.objective).toBe(current.objective);
    expect(board().document?.nodes.review).toBeUndefined();
    expect(board().proposal).toBeNull();
  });

  it("refuses to run unsaved, unvalidated, or ungated graphs", async () => {
    await runGraph(ctx);
    expect(notify).toHaveBeenLastCalledWith(
      "Save and validate the current graph before running it",
      "bad",
    );
    const current = doc();
    board().set({
      document: current,
      path: "/g.yaml",
      plan: { gates: ["review"] },
      planDigest: localDigest(current),
    });
    await runGraph(ctx);
    expect(notify).toHaveBeenLastCalledWith(
      "Review every human gate before starting this run",
      "bad",
    );
    expect(runMagentStream).not.toHaveBeenCalled();
  });

  it("runs an approved graph and resumes failed nodes", async () => {
    const current = doc();
    board().set({
      document: current,
      path: "/g.yaml",
      plan: { gates: ["review"] },
      planDigest: localDigest(current),
      approvedGates: new Set(["review"]),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const task = {
      id: "t1",
      title: "x",
      state: "succeeded",
      metadata: { run_id: "r1" },
    };
    client.createGraphTask.mockResolvedValue(task as never);
    client.task.mockResolvedValue(task as never);
    client.childTasks.mockResolvedValue([
      { id: "c1", state: "failed", metadata: { node_id: "verify" } },
    ] as never);
    vi.mocked(runMagentStream).mockResolvedValue({
      ok: true,
      command: "",
      stdout: "",
      stderr: "",
      status: 0,
    });
    await runGraph(ctx);
    expect(vi.mocked(runMagentStream).mock.calls[0][0]).toContain(
      "--approve-gates",
    );
    await controlRun(ctx, "retry");
    const resume = vi.mocked(runMagentStream).mock.calls[1][0];
    expect(resume.slice(0, 3)).toEqual(["graph", "resume", "r1"]);
    expect(resume).toContain("verify");
    client.action.mockResolvedValue({ ...task, state: "paused" } as never);
    await controlRun(ctx, "pause");
    expect(board().runTask?.state).toBe("paused");
  });

  it("pins and unpins recent graphs", () => {
    togglePinnedGraph("/work/p", "/g.yaml");
    expect(board().pinnedGraphs).toEqual(["/g.yaml"]);
    togglePinnedGraph("/work/p", "/g.yaml");
    expect(board().pinnedGraphs).toEqual([]);
  });
});
