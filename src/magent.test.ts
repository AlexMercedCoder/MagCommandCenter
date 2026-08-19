import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MagentCommandError, magentClient, parseJson, type MagentCommandResult } from "./magent";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

function result(stdout: string): MagentCommandResult {
  return { ok: true, command: "magent ask", stdout, stderr: "", status: 0 };
}

describe("magent bridge helpers", () => {
  beforeEach(() => mockedInvoke.mockReset());
  it("parses pure JSON command output", () => {
    expect(parseJson<{ ok: boolean }>(result('{"ok":true}'))).toEqual({ ok: true });
  });

  it("parses the trailing JSON object from mixed streamed output", () => {
    const parsed = parseJson<{ response: string }>(
      result('thinking...\nstdout: tool started\n{"ok":true,"response":"done"}\n')
    );

    expect(parsed?.response).toBe("done");
  });

  it("creates typed durable tasks through the machine API", async () => {
    mockedInvoke.mockResolvedValue(result('{"task":{"id":"task_1","state":"queued"}}'));
    const task = await magentClient.createTask("Build", "/tmp/project", "session-1");
    expect(task.id).toBe("task_1");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["execution", "create", "Build", "--project", "/tmp/project", "--session", "session-1"]
    });
  });

  it("uses strict Agentic Graph validation and machine-readable plans", async () => {
    mockedInvoke
      .mockResolvedValueOnce(result('{"ok":true,"findings":[]}'))
      .mockResolvedValueOnce(result('{"ok":true,"order":["inspect"]}'));
    expect(await magentClient.validateGraph("/tmp/plan.agraph.yaml")).toMatchObject({ ok: true });
    expect(await magentClient.planGraph("/tmp/plan.agraph.yaml")).toMatchObject({ order: ["inspect"] });
    expect(mockedInvoke).toHaveBeenLastCalledWith("run_magent", {
      args: ["graph", "plan", "/tmp/plan.agraph.yaml", "--json"]
    });
  });

  it("normalizes failed machine commands as MagentCommandError", async () => {
    mockedInvoke.mockResolvedValue({ ...result(""), ok: false, stderr: "task missing", status: 1 });
    await expect(magentClient.task("missing")).rejects.toBeInstanceOf(MagentCommandError);
  });

  it("requests events after an explicit cursor", async () => {
    mockedInvoke.mockResolvedValue(result('{"events":[{"sequence":4}]}'));
    const events = await magentClient.events("task_1", 3);
    expect(events[0].sequence).toBe(4);
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["execution", "events", "task_1", "--after", "3"]
    });
  });

  it("uses JSON checkpoint contracts and explicit restore confirmation", async () => {
    mockedInvoke
      .mockResolvedValueOnce(result('{"checkpoints":[{"id":"checkpoint_1"}]}'))
      .mockResolvedValueOnce(result('{"ok":true,"diff":"changed"}'))
      .mockResolvedValueOnce(result('{"ok":true,"checkpoint":"checkpoint_1"}'));

    expect((await magentClient.checkpoints())[0].id).toBe("checkpoint_1");
    expect((await magentClient.checkpointDiff("checkpoint_1")).diff).toBe("changed");
    await magentClient.restoreCheckpoint("checkpoint_1");
    expect(mockedInvoke).toHaveBeenLastCalledWith("run_magent", {
      args: ["checkpoint", "restore", "checkpoint_1", "--yes"]
    });
  });

  it("uses the bounded session messaging machine API", async () => {
    mockedInvoke
      .mockResolvedValueOnce(result('{"sessions":[{"session_id":"session_1"}]}'))
      .mockResolvedValueOnce(result('{"ok":true,"status":"delivered"}'));
    expect((await magentClient.sessionPeers())[0].session_id).toBe("session_1");
    expect((await magentClient.sendSessionMessage("session_1", "Review task 7")).status).toBe("delivered");
  });

  it("sends profile documents over stdin instead of command arguments", async () => {
    mockedInvoke.mockResolvedValue(result('{"ok":true,"ready":true}'));
    const document = { oap: "1.0", metadata: { name: "reviewer", revision: 1 }, spec: { role: {} } } as never;
    await magentClient.previewProfile(document, "/tmp/project");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent_input", {
      args: ["agent", "preview", "--input", "-", "--project", "/tmp/project"],
      input: JSON.stringify(document)
    });
  });

  it("uses digest-guarded profile revision restore", async () => {
    mockedInvoke
      .mockResolvedValueOnce(result('{"checkpoints":[{"path":"/tmp/r1.bak","revision":1}]}'))
      .mockResolvedValueOnce(result('{"ok":true}'));
    expect((await magentClient.profileRevisions("reviewer", "/tmp/project"))[0].revision).toBe(1);
    await magentClient.restoreProfileRevision("reviewer", "/tmp/r1.bak", "sha256:new", "/tmp/project");
    expect(mockedInvoke).toHaveBeenLastCalledWith("run_magent", {
      args: ["agent", "restore-revision", "reviewer", "/tmp/r1.bak", "--expected-digest", "sha256:new", "--project", "/tmp/project", "--yes"]
    });
  });

  it("loads profile document, authority, and revisions in one process", async () => {
    mockedInvoke.mockResolvedValue(result('{"profile":{"name":"reviewer"},"effective_profile":{"name":"reviewer"},"checkpoints":[]}'));
    const detail = await magentClient.profileDetail("reviewer", "/tmp/project");
    expect(detail.profile.name).toBe("reviewer");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["agent", "detail", "reviewer", "--project", "/tmp/project"]
    });
  });

  it("assigns a profile to gateway sessions through config API", async () => {
    mockedInvoke.mockResolvedValue(result('{"ok":true}'));
    await magentClient.setGatewayProfile("reviewer");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["config", "set", "gateway.agent_profile", "reviewer"]
    });
  });
});
