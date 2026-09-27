import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialAppState, useAppStore } from "./app-store";
import {
  detectMagent,
  enableNotifications,
  executeCommand,
  executeJson,
  exportDiagnostics,
  installMagent,
  refreshProjectHealth,
  runEcosystemReadiness,
  runEnvironmentDiagnostics,
  runReadiness,
} from "./magent-actions";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const app = () => useAppStore.getState();
const out = (stdout: unknown, ok = true) => ({
  ok,
  command: "magent",
  stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
  stderr: ok ? "" : "failed",
  status: ok ? 0 : 1,
});
const argsOf = (call: unknown[]) =>
  ((call[1] as { args?: string[] })?.args ?? []).join(" ");

beforeEach(() => {
  useAppStore.setState({ ...initialAppState(), project: "/work/p" });
  mockedInvoke.mockReset();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
});

describe("magent actions", () => {
  it("parses JSON results and toggles busy around the command", async () => {
    mockedInvoke.mockResolvedValue(out({ ok: true, value: 3 }));
    const seen: unknown[] = [];
    const running = executeJson<{ value: number }>(
      ["config", "get"],
      (data) => {
        seen.push(data?.value);
      },
    );
    expect(app().busy).toBe(true);
    await running;
    expect(app().busy).toBe(false);
    expect(seen).toEqual([3]);
    expect(app().commandHistory).toHaveLength(1);
  });

  it("turns launch failures into a toast instead of throwing", async () => {
    mockedInvoke.mockRejectedValue(new Error("spawn failed"));
    await executeCommand(["plugin", "list"]);
    await executeJson(["plugin", "list"], () => undefined);
    expect(app().toasts.map((toast) => toast.text)).toEqual([
      "spawn failed",
      "spawn failed",
    ]);
    expect(app().busy).toBe(false);
  });

  it("detects the version, system info, and contracts", async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === "run_setup_command") return out("MagAgent 1.4.0");
      const argv = (args as { args: string[] }).args.join(" ");
      if (argv === "system info")
        return out({ magent_version: "1.4.0", python: "3.12" });
      if (argv === "system contracts")
        return out({ schema: "s1", contracts: { task: { version: "v2" } } });
      return out({});
    });
    await detectMagent();
    expect(app().system).toMatchObject({
      magent_version: "1.4.0",
      contract_schema: "s1",
      contracts: { task: { version: "v2" } },
    });
  });

  it("installs with the selected method, then re-detects", async () => {
    mockedInvoke.mockResolvedValue(out("ok"));
    for (const [method, expected] of [
      ["pipx-install", "pipx install mag-agent"],
      ["pipx-upgrade", "pipx upgrade mag-agent"],
      ["pip-user", "python3 -m pip install --user -U mag-agent"],
    ] as const) {
      mockedInvoke.mockClear();
      app().set({ setupMethod: method });
      await installMagent();
      const setup = mockedInvoke.mock.calls.find(
        (call) =>
          call[0] === "run_setup_command" &&
          (call[1] as { program: string }).program !== "magent",
      )?.[1] as { program: string; args: string[] };
      expect(`${setup.program} ${setup.args.join(" ")}`).toBe(expected);
    }
  });

  it("runs readiness, ecosystem, environment, and project health checks", async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === "inspect_project")
        return { path: "/work/p", exists: true };
      const argv = (args as { args: string[] }).args.join(" ");
      if (argv.startsWith("readiness")) return out({ ok: true });
      if (argv.startsWith("system ecosystem-report")) return out({ ok: false });
      if (argv === "provider detect") return out({ providers: [] });
      return out({ ok: true });
    });
    await runReadiness();
    await runEcosystemReadiness();
    await runEnvironmentDiagnostics();
    await refreshProjectHealth();
    expect(app().readiness).toEqual({ ok: true });
    expect(app().ecosystemReadiness).toEqual({ ok: false });
    expect(app().providerDetection).toEqual({ providers: [] });
    expect(app().projectInspection?.exists).toBe(true);
    expect(mockedInvoke.mock.calls.map(argsOf)).toContain(
      "readiness --project /work/p",
    );
    expect(app().toasts[0].text).toBe("Project health inspected");
  });

  it("reports diagnostics export results and notification permission", async () => {
    mockedInvoke.mockImplementation(async (command) =>
      command === "save_diagnostics_bundle" ? "/tmp/bundle.json" : out({}),
    );
    await exportDiagnostics();
    expect(app().toasts[0].text).toContain("/tmp/bundle.json");
    vi.stubGlobal("Notification", {
      requestPermission: vi.fn().mockResolvedValue("denied"),
    });
    await enableNotifications();
    expect(app().toasts[0].text).toBe("Task notifications were not enabled");
    vi.unstubAllGlobals();
  });
});
