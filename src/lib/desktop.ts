import { invoke } from "@tauri-apps/api/core";

export class DesktopUnavailableError extends Error {
  constructor() {
    super(
      "This feature requires the packaged Mag Command Center desktop runtime.",
    );
    this.name = "DesktopUnavailableError";
  }
}

export function desktopAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type RuntimeTransport = {
  kind: "native" | "remote";
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
};

const nativeTransport: RuntimeTransport = {
  kind: "native",
  invoke: (command, args) => invoke(command, args),
};

let transport: RuntimeTransport = nativeTransport;

export function runtimeTransportKind() {
  return transport.kind;
}

export function configureNativeTransport() {
  transport = nativeTransport;
}

export function configureRemoteTransport(endpoint: string, token: string) {
  const url = new URL(endpoint);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      "Remote runtimes require HTTPS; plain HTTP is allowed only on loopback.",
    );
  }
  if (!token.trim() || token.length > 4096)
    throw new Error("A bounded runtime access token is required.");
  transport = {
    kind: "remote",
    async invoke<T>(command: string, args: Record<string, unknown>) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: command,
            params: args,
          }),
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
        });
        if (!response.ok)
          throw new Error(`Remote runtime returned HTTP ${response.status}.`);
        const payload = (await response.json()) as {
          result?: T;
          error?: { message?: string };
        };
        if (payload.error)
          throw new Error(
            payload.error.message || "Remote runtime request failed.",
          );
        return payload.result as T;
      } finally {
        window.clearTimeout(timeout);
      }
    },
  };
}

export async function desktopInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (transport.kind === "native" && !desktopAvailable())
    throw new DesktopUnavailableError();
  return transport.invoke<T>(command, args);
}
