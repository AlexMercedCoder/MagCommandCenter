import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../src-tauri/tests/fixtures/rpc-gateway-lifecycle.json";
import { runMagentStream, runSetupCommand } from "../magent";
import { refreshApprovals } from "./approvals";
import { configureNativeTransport, configureRemoteTransport } from "./desktop";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
type Exchange = { name: string; response: { result?: unknown } };
const exchange = (name: string) =>
  (fixture.exchanges as Exchange[]).find((item) => item.name === name)!;

beforeEach(async () => {
  mockedInvoke.mockReset();
  vi.mocked(listen).mockResolvedValue(() => undefined);
  mockedInvoke.mockImplementation(async (command, args) => {
    if (command === "configure_remote_runtime") return "http://127.0.0.1:7850";
    if (command === "remote_runtime_request") {
      const { method } = args as { method: string };
      if (method === "run_magent")
        return exchange("run_magent").response.result;
      return null;
    }
    if (command === "remote_stream")
      return (
        exchange("stream_events_done").response.result as { result: unknown }
      ).result;
    if (command === "approval_snapshot")
      return { pending: [], receipts: [], interrupted: [] };
    return null;
  });
  await configureRemoteTransport(
    "http://127.0.0.1:7850/rpc",
    "a-long-enough-token",
  );
});

afterEach(() => configureNativeTransport());

describe("remote mode against magent.rpc.v1", () => {
  it("streams through the native gateway client instead of refusing", async () => {
    const result = await runMagentStream(
      ["ask", "hello", "--json"],
      () => undefined,
      {
        id: "fixture-run",
      },
    );
    expect(result.ok).toBe(true);
    const call = mockedInvoke.mock.calls.find(
      (item) => item[0] === "remote_stream",
    );
    expect(call?.[1]).toEqual({
      id: "fixture-run",
      args: ["ask", "hello", "--json", "--approval-stdio"],
    });
  });

  it("detects MagAgent on the gateway and refuses installer commands", async () => {
    const version = await runSetupCommand("magent", ["--version"]);
    expect(version.ok).toBe(true);
    const pipx = await runSetupCommand("pipx", ["install", "mag-agent"]);
    expect(pipx.ok).toBe(false);
    expect(pipx.stderr).toMatch(/gateway host/);
  });

  it("reads approval state from the native runtime even in remote mode", async () => {
    await refreshApprovals();
    expect(mockedInvoke.mock.calls.map((item) => item[0])).toContain(
      "approval_snapshot",
    );
    expect(
      mockedInvoke.mock.calls.some(
        (item) =>
          item[0] === "remote_runtime_request" &&
          (item[1] as { method: string }).method === "approval_snapshot",
      ),
    ).toBe(false);
  });
});
