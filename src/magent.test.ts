import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decideApproval,
  MagentCommandError,
  magentClient,
  parseJson,
  type PendingAAISApproval,
  type MagentCommandResult,
} from "./magent";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

function result(stdout: string): MagentCommandResult {
  return { ok: true, command: "magent ask", stdout, stderr: "", status: 0 };
}

describe("magent bridge helpers", () => {
  beforeEach(() => mockedInvoke.mockReset());
  it("parses pure JSON command output", () => {
    expect(parseJson<{ ok: boolean }>(result('{"ok":true}'))).toEqual({
      ok: true,
    });
  });

  it("returns a digest-bound AAIS decision to the originating stream", async () => {
    mockedInvoke.mockResolvedValue(true);
    const pending: PendingAAISApproval = {
      streamId: "stream-1",
      envelope: {
        aais: "1.0",
        type: "approval.requested",
        id: "event-request",
        occurred_at: "2026-08-30T00:00:00Z",
        sequence: 1,
        stream: "authority",
        request: {
          id: "request-1",
          action_digest: "sha256:0123456789abcdef",
          action: {
            kind: "tool.call",
            name: "shell.exec",
            summary: "Check syntax",
            arguments: { command: "node --check app.js" },
          },
          risk: { level: "medium", reasons: ["Runs a process"] },
          choices: [
            { decision: "approve", scope: "once", label: "Allow once" },
          ],
        },
      },
    };

    await decideApproval(pending, pending.envelope.request.choices[0]);

    const invocation =
      mockedInvoke.mock.calls[mockedInvoke.mock.calls.length - 1];
    expect(invocation?.[0]).toBe("write_magent_stream");
    const args = invocation?.[1] as { id: string; line: string };
    expect(args.id).toBe("stream-1");
    expect(JSON.parse(args.line)).toMatchObject({
      type: "approval.decided",
      decision: {
        request_id: "request-1",
        action_digest: "sha256:0123456789abcdef",
        decision: "approve",
        scope: "once",
      },
    });
  });

  it("parses the trailing JSON object from mixed streamed output", () => {
    const parsed = parseJson<{ response: string }>(
      result(
        'thinking...\nstdout: tool started\n{"ok":true,"response":"done"}\n',
      ),
    );

    expect(parsed?.response).toBe("done");
  });

  it("creates typed durable tasks through the machine API", async () => {
    mockedInvoke.mockResolvedValue(
      result('{"task":{"id":"task_1","state":"queued"}}'),
    );
    const task = await magentClient.createTask(
      "Build",
      "/tmp/project",
      "session-1",
    );
    expect(task.id).toBe("task_1");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: [
        "execution",
        "create",
        "Build",
        "--project",
        "/tmp/project",
        "--session",
        "session-1",
      ],
    });
  });

  it("uses strict Agentic Graph validation and machine-readable plans", async () => {
    mockedInvoke
      .mockResolvedValueOnce(result('{"ok":true,"findings":[]}'))
      .mockResolvedValueOnce(result('{"ok":true,"order":["inspect"]}'));
    expect(
      await magentClient.validateGraph("/tmp/plan.agraph.yaml"),
    ).toMatchObject({ ok: true });
    expect(await magentClient.planGraph("/tmp/plan.agraph.yaml")).toMatchObject(
      { order: ["inspect"] },
    );
    expect(mockedInvoke).toHaveBeenLastCalledWith("run_magent", {
      args: ["graph", "plan", "/tmp/plan.agraph.yaml", "--json"],
    });
  });

  it("loads reconnectable graph status through the versioned JSON contract", async () => {
    mockedInvoke.mockResolvedValue(
      result(
        '{"schema_version":"magent.graph-status.v1","run_id":"run_1","nodes":[]}',
      ),
    );
    await expect(magentClient.graphRun("run_1")).resolves.toMatchObject({
      schema_version: "magent.graph-status.v1",
    });
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["graph", "status", "run_1", "--json"],
    });
  });

  it("preserves model graph fallback details for the review UI", async () => {
    mockedInvoke.mockResolvedValue(
      result(
        JSON.stringify({
          document: {
            ags_version: "1.0",
            kind: "AgenticGraph",
            id: "fallback",
            title: "Fallback",
            objective: "Research",
            entrypoints: ["work"],
            nodes: { work: { title: "Work", description: "Research" } },
          },
          digest: "sha256-fallback",
          changes: [],
          model: "planner",
          profile: "review",
          fallback: true,
          fallback_reason: "The provider timed out after 30 seconds.",
          model_findings: ["provider timeout"],
        }),
      ),
    );

    const draft = await magentClient.modelGraphDraft(
      "Research",
      "/tmp/project",
    );

    expect(draft.fallback).toBe(true);
    expect(draft.fallback_reason).toContain("timed out");
    expect(draft.model_findings).toEqual(["provider timeout"]);
  });

  it("sends unsaved graph drafts over stdin and preserves digest checks", async () => {
    const document = {
      ags_version: "1.0",
      kind: "AgenticGraph",
      id: "test/board",
      title: "Board",
      objective: "Test",
      entrypoints: ["work"],
      nodes: { work: { title: "Work", description: "Work" } },
    } as never;
    mockedInvoke
      .mockResolvedValueOnce(result('{"ok":true,"plan":{}}'))
      .mockResolvedValueOnce(
        result(
          '{"ok":true,"path":"/tmp/project/board.agraph.yaml","digest":"sha256-new"}',
        ),
      );
    await magentClient.previewGraph(document, "/tmp/project");
    expect(mockedInvoke).toHaveBeenLastCalledWith("run_magent_input", {
      args: ["graph", "preview", "--input", "-", "--project", "/tmp/project"],
      input: JSON.stringify(document),
    });
    await magentClient.saveGraph(
      document,
      "/tmp/project/board.agraph.yaml",
      "/tmp/project",
      "sha256-old",
    );
    expect(mockedInvoke).toHaveBeenLastCalledWith("run_magent_input", {
      args: [
        "graph",
        "apply",
        "/tmp/project/board.agraph.yaml",
        "--input",
        "-",
        "--project",
        "/tmp/project",
        "--expected-digest",
        "sha256-old",
      ],
      input: JSON.stringify(document),
    });
  });

  it("normalizes failed machine commands as MagentCommandError", async () => {
    mockedInvoke.mockResolvedValue({
      ...result(""),
      ok: false,
      stderr: "task missing",
      status: 1,
    });
    await expect(magentClient.task("missing")).rejects.toBeInstanceOf(
      MagentCommandError,
    );
  });

  it("requests events after an explicit cursor", async () => {
    mockedInvoke.mockResolvedValue(result('{"events":[{"sequence":4}]}'));
    const events = await magentClient.events("task_1", 3);
    expect(events[0].sequence).toBe(4);
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["execution", "events", "task_1", "--after", "3"],
    });
  });

  it("uses JSON checkpoint contracts and explicit restore confirmation", async () => {
    mockedInvoke
      .mockResolvedValueOnce(result('{"checkpoints":[{"id":"checkpoint_1"}]}'))
      .mockResolvedValueOnce(result('{"ok":true,"diff":"changed"}'))
      .mockResolvedValueOnce(result('{"ok":true,"checkpoint":"checkpoint_1"}'));

    expect((await magentClient.checkpoints())[0].id).toBe("checkpoint_1");
    expect((await magentClient.checkpointDiff("checkpoint_1")).diff).toBe(
      "changed",
    );
    await magentClient.restoreCheckpoint("checkpoint_1");
    expect(mockedInvoke).toHaveBeenLastCalledWith("run_magent", {
      args: ["checkpoint", "restore", "checkpoint_1", "--yes"],
    });
  });

  it("uses the bounded session messaging machine API", async () => {
    mockedInvoke
      .mockResolvedValueOnce(
        result('{"sessions":[{"session_id":"session_1"}]}'),
      )
      .mockResolvedValueOnce(result('{"ok":true,"status":"delivered"}'));
    expect((await magentClient.sessionPeers())[0].session_id).toBe("session_1");
    expect(
      (await magentClient.sendSessionMessage("session_1", "Review task 7"))
        .status,
    ).toBe("delivered");
  });

  it("sends profile documents over stdin instead of command arguments", async () => {
    mockedInvoke.mockResolvedValue(result('{"ok":true,"ready":true}'));
    const document = {
      oap: "1.0",
      metadata: { name: "reviewer", revision: 1 },
      spec: { role: {} },
    } as never;
    await magentClient.previewProfile(document, "/tmp/project");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent_input", {
      args: ["agent", "preview", "--input", "-", "--project", "/tmp/project"],
      input: JSON.stringify(document),
    });
  });

  it("generates reviewable profile drafts through the machine API", async () => {
    mockedInvoke.mockResolvedValue(
      result(
        '{"ok":true,"document":{"oap":"1.0","kind":"AgentProfile","metadata":{"name":"reviewer","revision":1},"spec":{"role":{"instructions":"Review."}}}}',
      ),
    );

    const draft = await magentClient.generateProfileDraft(
      "Create a cautious reviewer",
      "/tmp/project",
      "reviewer",
    );

    expect(draft.document.metadata.name).toBe("reviewer");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: [
        "agent",
        "generate-draft",
        "Create a cautious reviewer",
        "--project",
        "/tmp/project",
        "--name",
        "reviewer",
      ],
    });
  });

  it("normalizes live provider model names for the profile builder", async () => {
    mockedInvoke.mockResolvedValue(
      result(
        '{"ok":true,"provider":"nous-portal","models":["deepseek/deepseek-v4-flash",{"id":"custom/model"}]}',
      ),
    );

    await expect(magentClient.providerModels("nous-portal")).resolves.toEqual([
      { id: "deepseek/deepseek-v4-flash", name: "deepseek/deepseek-v4-flash" },
      { id: "custom/model" },
    ]);
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["provider", "models", "nous-portal"],
    });
  });

  it("uses digest-guarded profile revision restore", async () => {
    mockedInvoke
      .mockResolvedValueOnce(
        result('{"checkpoints":[{"path":"/tmp/r1.bak","revision":1}]}'),
      )
      .mockResolvedValueOnce(result('{"ok":true}'));
    expect(
      (await magentClient.profileRevisions("reviewer", "/tmp/project"))[0]
        .revision,
    ).toBe(1);
    await magentClient.restoreProfileRevision(
      "reviewer",
      "/tmp/r1.bak",
      "sha256:new",
      "/tmp/project",
    );
    expect(mockedInvoke).toHaveBeenLastCalledWith("run_magent", {
      args: [
        "agent",
        "restore-revision",
        "reviewer",
        "/tmp/r1.bak",
        "--expected-digest",
        "sha256:new",
        "--project",
        "/tmp/project",
        "--yes",
      ],
    });
  });

  it("loads profile document, authority, and revisions in one process", async () => {
    mockedInvoke.mockResolvedValue(
      result(
        '{"profile":{"name":"reviewer"},"effective_profile":{"name":"reviewer"},"checkpoints":[]}',
      ),
    );
    const detail = await magentClient.profileDetail("reviewer", "/tmp/project");
    expect(detail.profile.name).toBe("reviewer");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["agent", "detail", "reviewer", "--project", "/tmp/project"],
    });
  });

  it("assigns a profile to gateway sessions through config API", async () => {
    mockedInvoke.mockResolvedValue(result('{"ok":true}'));
    await magentClient.setGatewayProfile("reviewer");
    expect(mockedInvoke).toHaveBeenCalledWith("run_magent", {
      args: ["config", "set", "gateway.agent_profile", "reviewer"],
    });
  });
});
