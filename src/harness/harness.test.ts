import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loroAdapter, loroRunArgs } from "./loro-adapter";
import { magentAdapter, magentAskArgs } from "./magent-adapter";
import {
  harnessFor,
  loroHarnessEnabled,
  setLoroHarnessEnabled,
} from "./registry";
import { configureNativeTransport } from "../lib/desktop";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
type Handler = (event: { payload: unknown }) => void;
let handler: Handler | undefined;

beforeEach(() => {
  configureNativeTransport();
  mockedInvoke.mockReset();
  vi.mocked(listen).mockImplementation(async (_name, fn) => {
    handler = fn as Handler;
    return () => undefined;
  });
});

describe("harness adapters", () => {
  it("declare what each harness supports", () => {
    expect(magentAdapter.capabilities).toMatchObject({
      durableTasks: true,
      graphs: true,
      memory: true,
      remote: true,
    });
    expect(loroAdapter.experimental).toBe(true);
    expect(loroAdapter.capabilities).toMatchObject({
      streaming: true,
      approvals: true,
      cancel: true,
      durableTasks: false,
      remote: false,
    });
    expect(harnessFor(undefined).id).toBe("magent");
    expect(harnessFor("loro").id).toBe("loro");
  });

  it("keeps the MagAgent ask argument order", () => {
    expect(
      magentAskArgs({
        project: "/p",
        profile: "builder",
        executionTaskId: "t1",
        permissionMode: "balanced",
        prompt: "go",
      }),
    ).toEqual([
      "ask",
      "--json",
      "--events",
      "--project",
      "/p",
      "--agent",
      "builder",
      "--execution-task-id",
      "t1",
      "--repair-attempts",
      "1",
      "--permission-mode",
      "balanced",
      "go",
    ]);
  });

  it("runs Loro with the prompt out of argv and relays its stream", async () => {
    const events: string[] = [];
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === "run_harness_stream") {
        handler?.({ payload: { id: "s1", stream: "stdout", line: "working" } });
        handler?.({
          payload: { id: "other", stream: "stdout", line: "not mine" },
        });
        return {
          ok: true,
          command: "loro run",
          stdout: JSON.stringify({ ok: true, response: "Loro says hi" }),
          stderr: "",
          status: 0,
        };
      }
      if (command === "approval_snapshot")
        return { pending: [], receipts: [], interrupted: [] };
      return args;
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    const answer = await loroAdapter.ask(
      { prompt: "secret plan", project: "/work/p" },
      (event) => events.push(event.line),
      { id: "s1" },
    );
    expect(answer.text).toBe("Loro says hi");
    expect(events).toEqual(["working"]);
    const call = mockedInvoke.mock.calls.find(
      (item) => item[0] === "run_harness_stream",
    );
    expect(call?.[1]).toEqual({
      id: "s1",
      harness: "loro",
      args: ["run", "--json", "--approval-stdio"],
      prompt: "secret plan",
      cwd: "/work/p",
    });
    expect((call?.[1] as { args: string[] }).args).not.toContain("secret plan");
    expect(loroRunArgs({ profile: "analyst" })).toContain("analyst");
  });

  it("stops Loro through the native process tree", async () => {
    mockedInvoke.mockResolvedValue(true);
    await loroAdapter.cancel("s1");
    expect(mockedInvoke).toHaveBeenCalledWith("cancel_magent_stream", {
      id: "s1",
    });
  });

  it("keeps Loro behind the experimental flag", () => {
    expect(loroHarnessEnabled()).toBe(false);
    setLoroHarnessEnabled(true);
    expect(loroHarnessEnabled()).toBe(true);
    setLoroHarnessEnabled(false);
  });
});
