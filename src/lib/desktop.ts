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
  if (transport.kind === "remote" && desktopAvailable())
    void invoke("disconnect_remote_runtime").catch(() => undefined);
  transport = nativeTransport;
}

/** Client-side checks that mirror the native ones, so mistakes fail before a dialog. */
export function validateRemoteEndpoint(endpoint: string, token: string) {
  const url = new URL(endpoint);
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
    url.hostname,
  );
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      "Remote runtimes require HTTPS; plain HTTP is allowed only on loopback.",
    );
  }
  if (!token.trim() || token.length > 4096)
    throw new Error("A bounded runtime access token is required.");
  return url;
}

/**
 * Connects the experimental remote runtime. The native side confirms the host in a
 * system dialog, keeps the token in memory, and forwards JSON-RPC calls only to that
 * host; the renderer never talks to the network directly (C-9).
 */
export async function configureRemoteTransport(
  endpoint: string,
  token: string,
  options: { remember?: boolean; useSaved?: boolean } = {},
): Promise<string> {
  validateRemoteEndpoint(endpoint, options.useSaved ? "saved" : token);
  if (!desktopAvailable()) throw new DesktopUnavailableError();
  const origin = await invoke<string>("configure_remote_runtime", {
    endpoint,
    token: options.useSaved ? "" : token,
    remember: Boolean(options.remember),
  });
  transport = {
    kind: "remote",
    invoke: (command, args) =>
      invoke("remote_runtime_request", { method: command, params: args }),
  };
  return origin;
}

/** Whether a gateway token for this endpoint is in the OS credential store. */
export async function remoteTokenSaved(endpoint: string): Promise<boolean> {
  if (!desktopAvailable()) return false;
  try {
    return await invoke<boolean>("remote_token_saved", { endpoint });
  } catch {
    return false;
  }
}

export async function forgetRemoteToken(endpoint: string): Promise<void> {
  await invoke("forget_remote_token", { endpoint });
}

export async function desktopInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (transport.kind === "native" && !desktopAvailable())
    throw new DesktopUnavailableError();
  return transport.invoke<T>(command, args);
}
