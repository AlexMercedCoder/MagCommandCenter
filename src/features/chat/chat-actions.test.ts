import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialAppState, useAppStore } from "../../stores/app-store";
import * as magent from "../../magent";
import { workspaceClient } from "../../lib/workspace-client";
import {
  activeProfileName,
  compactChatSession,
  configureGroup,
  createChatSession,
  createOrchestratedGoal,
  deleteChatSession,
  forkChatSession,
  openSession,
  previewArtifact,
  renameChatSession,
  runAsk,
  selectSessionProfile,
  setSessionPermissionMode,
  type ChatRuntime,
} from "./chat-actions";
import { initialChatState, useChatStore } from "./chat-store";

vi.mock("../../magent", async (original) => ({
  ...(await original<typeof import("../../magent")>()),
  runMagent: vi.fn(),
  runMagentStream: vi.fn(),
  readProjectArtifact: vi.fn(),
}));
vi.mock("../../lib/persistence", () => ({
  loadAppState: vi.fn(async (_key: string, fallback: unknown) => fallback),
  saveAppState: vi.fn(async () => undefined),
}));
vi.mock("../../lib/workspace-client", () => ({
  workspaceClient: { context: vi.fn() },
}));

const chat = () => useChatStore.getState();
const app = () => useAppStore.getState();
const stream = vi.mocked(magent.runMagentStream);
const run = vi.mocked(magent.runMagent);

function runtime(): ChatRuntime {
  let counter = 0;
  return {
    createTask: vi.fn(async (title: string) => ({
      id: `task_${++counter}`,
      title,
      state: "queued",
    })) as unknown as ChatRuntime["createTask"],
    registerStream: vi.fn(),
    refreshTasks: vi.fn(async () => undefined),
    profiles: [
      { name: "builder", profile_digest: "sha256:b" },
      { name: "reviewer", profile_digest: "sha256:r" },
    ] as unknown as ChatRuntime["profiles"],
    defaultProfile: "magagent",
  };
}

const reply = (response: string, ok = true) => ({
  ok,
  command: "magent ask",
  stdout: JSON.stringify({ ok, response }),
  stderr: "",
  status: ok ? 0 : 1,
});

beforeEach(() => {
  useAppStore.setState({ ...initialAppState(), project: "/work/p" });
  useChatStore.setState(initialChatState());
  chat().set({
    session: "s1",
    sessions: [{ id: "s1", name: "one", createdAt: "t", updatedAt: "t" }],
    history: [],
  });
  vi.restoreAllMocks();
  stream.mockReset();
  run.mockReset();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
});

describe("chat actions", () => {
  it("runs an ask with the pinned profile and records both sides", async () => {
    const rt = runtime();
    chat().patchActiveSession({
      agentProfile: "builder",
      permissionMode: "balanced",
    });
    chat().set({ prompt: "Fix the tests" });
    stream.mockImplementation(async (_args, onEvent) => {
      onEvent({ id: "x", stream: "stdout", line: "working" });
      return reply("All green");
    });
    await runAsk(rt);
    const args = stream.mock.calls[0][0];
    expect(args).toEqual([
      "ask",
      "--json",
      "--events",
      "--project",
      "/work/p",
      "--agent",
      "builder",
      "--execution-task-id",
      "task_1",
      "--repair-attempts",
      "1",
      "--permission-mode",
      "balanced",
      "Fix the tests",
    ]);
    expect(chat().history.map((item) => [item.role, item.content])).toEqual([
      ["user", "Fix the tests"],
      ["agent", "All green"],
    ]);
    expect(chat().streamLines).toEqual(["stdout: working"]);
    expect(chat().busy).toBe(false);
    expect(chat().sessions[0].summary).toBe("All green");
    expect(rt.refreshTasks).toHaveBeenCalled();
  });

  it("reports a failed run in the transcript and as a toast", async () => {
    chat().set({ prompt: "Do it" });
    stream.mockRejectedValue(new Error("provider unreachable"));
    await runAsk(runtime());
    expect(chat().history[chat().history.length - 1]?.content).toBe(
      "Run failed: provider unreachable",
    );
    expect(app().toasts[0].text).toBe("provider unreachable");
  });

  it("does not start a run when attaching workspace context fails", async () => {
    chat().set({
      prompt: "Review",
      context: [{ path: "a.ts", name: "a.ts", size: 1 }] as never,
    });
    vi.mocked(workspaceClient.context).mockRejectedValue(
      new Error("too large"),
    );
    await runAsk(runtime());
    expect(stream).not.toHaveBeenCalled();
    expect(app().toasts[0].text).toBe("too large");
  });

  it("hands findings from one specialist to the next in a sequential group", async () => {
    configureGroup(["builder", "reviewer"], "sequential", "builder");
    expect(chat().sessions[0].kind).toBe("group");
    chat().set({ prompt: "Ship it" });
    stream
      .mockResolvedValueOnce(reply("built"))
      .mockResolvedValueOnce(reply("reviewed"));
    await runAsk(runtime());
    const secondArgs = stream.mock.calls[1][0];
    const second = secondArgs[secondArgs.length - 1];
    expect(second).toContain("## builder\nbuilt");
    expect(chat().history.map((item) => item.speaker ?? item.role)).toEqual([
      "user",
      "builder",
      "reviewer",
    ]);
  });

  it("asks the coordinator to synthesize parallel findings", async () => {
    configureGroup(["builder", "reviewer"], "coordinator", "reviewer");
    chat().set({ prompt: "Plan" });
    stream.mockResolvedValue(reply("done"));
    await runAsk(runtime());
    const prompts = stream.mock.calls.map(
      (call) => call[0][call[0].length - 1],
    );
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Synthesize these attributed");
  });

  it("runs a Loro session through its adapter without a durable task", async () => {
    const rt = runtime();
    chat().patchActiveSession({ harness: "loro" });
    chat().set({ prompt: "Audit the lake" });
    const loro = await import("../../harness/loro-adapter");
    const ask = vi.spyOn(loro.loroAdapter, "ask").mockResolvedValue({
      result: {
        ok: true,
        command: "loro run",
        stdout: "",
        stderr: "",
        status: 0,
      },
      data: { response: "Done" },
      text: "Done",
    });
    await runAsk(rt);
    expect(rt.createTask).not.toHaveBeenCalled();
    expect(ask.mock.calls[0][0]).toMatchObject({
      prompt: "Audit the lake",
      project: "/work/p",
      profile: undefined,
    });
    expect(chat().history[chat().history.length - 1]?.content).toBe("Done");
    expect(chat().activeStream).toBeNull();
  });

  it("stages an orchestrated goal", async () => {
    chat().set({ prompt: "Refactor" });
    run.mockResolvedValue({
      ok: true,
      command: "magent goal",
      stdout: JSON.stringify({ ok: true, preview_command: "magent goal-run" }),
      stderr: "",
      status: 0,
    });
    await createOrchestratedGoal(runtime());
    expect(run.mock.calls[0][0]).toContain("--orchestrated");
    expect(chat().history[0].content).toBe("Stage goal: Refactor");
    expect(chat().busy).toBe(false);
  });

  it("creates, renames, forks, compacts, and deletes sessions", () => {
    const rt = runtime();
    chat().set({ sessionDraftName: "research" });
    createChatSession(rt);
    const created = chat().sessions[0];
    expect(created.name).toBe("research");
    expect(chat().session).toBe(created.id);
    chat().set({ sessionDraftName: "renamed" });
    renameChatSession();
    expect(chat().sessions[0].name).toBe("renamed");
    forkChatSession();
    expect(chat().sessions[0].parentSessionId).toBe(created.id);
    chat().set({
      history: Array.from({ length: 8 }, (_, index) => ({
        id: String(index),
        role: "user" as const,
        content: `m${index}`,
        createdAt: "t",
      })),
    });
    compactChatSession();
    expect(chat().history).toHaveLength(7);
    expect(chat().history[0].content).toContain("Compacted session context (2");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const before = chat().sessions.length;
    deleteChatSession();
    expect(chat().sessions).toHaveLength(before - 1);
  });

  it("requires confirmation for full-access mode", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    setSessionPermissionMode("yolo");
    expect(chat().sessions[0].permissionMode).toBeUndefined();
    setSessionPermissionMode("paranoid");
    expect(chat().sessions[0].permissionMode).toBe("paranoid");
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("pins profiles with their digest and falls back to the crew coordinator", () => {
    const rt = runtime();
    expect(activeProfileName(rt)).toBe("magagent");
    app().updateProjectCrew({
      project: "/work/p",
      coordinator: "reviewer",
      members: [],
    });
    expect(activeProfileName(rt)).toBe("reviewer");
    selectSessionProfile("builder", rt.profiles);
    expect(chat().sessions[0].profileDigest).toBe("sha256:b");
    expect(activeProfileName(rt)).toBe("builder");
  });

  it("opens sessions and previews artifacts", async () => {
    openSession("s1");
    expect(app().view).toBe("chat");
    vi.mocked(magent.readProjectArtifact).mockRejectedValue(
      new Error("outside project"),
    );
    await previewArtifact("../x");
    expect(app().toasts[0].text).toBe("outside project");
  });
});
