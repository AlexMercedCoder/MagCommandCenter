import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureNativeTransport,
  configureRemoteTransport,
  desktopInvoke,
  runtimeTransportKind,
} from "./desktop";

describe("desktop runtime transport", () => {
  afterEach(() => {
    configureNativeTransport();
    vi.unstubAllGlobals();
  });

  it("rejects insecure non-loopback endpoints", () => {
    expect(() =>
      configureRemoteTransport("http://agent.example/rpc", "secret"),
    ).toThrow(/HTTPS/);
    expect(runtimeTransportKind()).toBe("native");
  });

  it("keeps credentials in the authorization header and returns JSON-RPC results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { version: "1.0" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    configureRemoteTransport("https://agent.example/rpc", "ephemeral-secret");
    await expect(
      desktopInvoke<{ version: string }>("runtime_info"),
    ).resolves.toEqual({ version: "1.0" });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://agent.example/rpc");
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({
      authorization: "Bearer ephemeral-secret",
    });
    expect(init.body).not.toContain("ephemeral-secret");
  });

  it("accepts plain HTTP only for loopback development", () => {
    expect(() =>
      configureRemoteTransport("http://127.0.0.1:8080/rpc", "secret"),
    ).not.toThrow();
    expect(runtimeTransportKind()).toBe("remote");
  });
});
