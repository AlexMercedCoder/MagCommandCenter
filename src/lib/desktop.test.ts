import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureNativeTransport,
  configureRemoteTransport,
  desktopInvoke,
  runtimeTransportKind,
} from "./desktop";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

describe("desktop runtime transport", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation(async (command) =>
      command === "configure_remote_runtime" ? "https://agent.example" : null,
    );
  });
  afterEach(() => {
    configureNativeTransport();
  });

  it("rejects insecure non-loopback endpoints before asking the native side", async () => {
    await expect(
      configureRemoteTransport("http://agent.example/rpc", "secret"),
    ).rejects.toThrow(/HTTPS/);
    expect(runtimeTransportKind()).toBe("native");
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("hands the token to the native proxy once and routes calls through it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await configureRemoteTransport("https://agent.example/rpc", "ephemeral");
    expect(mockedInvoke).toHaveBeenCalledWith("configure_remote_runtime", {
      endpoint: "https://agent.example/rpc",
      token: "ephemeral",
      remember: false,
    });
    mockedInvoke.mockResolvedValueOnce({ version: "1.0" });
    await expect(
      desktopInvoke<{ version: string }>("runtime_info", { a: 1 }),
    ).resolves.toEqual({ version: "1.0" });
    const call = mockedInvoke.mock.calls[mockedInvoke.mock.calls.length - 1];
    expect(call).toEqual([
      "remote_runtime_request",
      { method: "runtime_info", params: { a: 1 } },
    ]);
    expect(JSON.stringify(call)).not.toContain("ephemeral");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stays native when the user cancels the native confirmation", async () => {
    mockedInvoke.mockRejectedValueOnce("Remote connection cancelled.");
    await expect(
      configureRemoteTransport("http://127.0.0.1:8080/rpc", "secret"),
    ).rejects.toBe("Remote connection cancelled.");
    expect(runtimeTransportKind()).toBe("native");
  });

  it("can connect with a token saved in the keychain", async () => {
    await configureRemoteTransport("https://agent.example/rpc", "", {
      useSaved: true,
    });
    expect(mockedInvoke).toHaveBeenCalledWith("configure_remote_runtime", {
      endpoint: "https://agent.example/rpc",
      token: "",
      remember: false,
    });
  });

  it("disconnects the native proxy when switching back", async () => {
    await configureRemoteTransport("http://127.0.0.1:8080/rpc", "secret");
    expect(runtimeTransportKind()).toBe("remote");
    configureNativeTransport();
    expect(mockedInvoke).toHaveBeenLastCalledWith("disconnect_remote_runtime");
  });
});
