/**
 * Provider onboarding (C-5): store a key without a terminal, test it on request, or start
 * offline with MagAgent's mock provider.
 *
 * Keys go through the dedicated `magent_auth_add` native command, which pipes them to
 * `magent auth add <provider> --api-key-stdin`. They never enter argv, command history,
 * app state, or logs.
 */
import { desktopInvoke } from "./desktop";
import { parseJson, runMagent, type MagentCommandResult } from "../magent";

export type KeyStorage = "keyring" | "config";

export type ProviderOption = {
  id: string;
  label: string;
  defaultModel: string;
  envPresent: boolean;
  envName?: string;
  local: boolean;
};

export type AuthStatus = {
  keyringAvailable: boolean;
  configured: Record<string, KeyStorage | "env">;
};

export type ProviderActionResult = {
  ok: boolean;
  message: string;
  hint?: string;
};

export const MOCK_PROVIDER = "mock";

type DetectPayload = {
  providers?: Array<{
    id: string;
    label: string;
    default_model: string;
    env_present?: boolean;
    env_present_name?: string;
    api_key_env?: string;
    local?: boolean;
  }>;
};

export async function listProviders(): Promise<ProviderOption[]> {
  const result = await runMagent(["provider", "detect"]);
  const data = parseJson<DetectPayload>(result);
  if (!result.ok || !data?.providers) throw new Error(failure(result));
  return data.providers.map((item) => ({
    id: item.id,
    label: item.label,
    defaultModel: item.default_model,
    envPresent: Boolean(item.env_present),
    envName: item.env_present_name || item.api_key_env || undefined,
    local: Boolean(item.local),
  }));
}

export async function authStatus(): Promise<AuthStatus> {
  const result = await runMagent(["auth", "list"]);
  const data = parseJson<{
    keyring_available?: boolean;
    credentials?: Array<{
      provider: string;
      storage: string;
      configured: boolean;
    }>;
  }>(result);
  if (!result.ok || !data) throw new Error(failure(result));
  const configured: AuthStatus["configured"] = {};
  for (const row of data.credentials ?? []) {
    if (
      row.configured &&
      (row.storage === "keyring" ||
        row.storage === "config" ||
        row.storage === "env")
    )
      configured[row.provider] = row.storage;
  }
  return { keyringAvailable: Boolean(data.keyring_available), configured };
}

export async function storeProviderKey(
  provider: string,
  key: string,
  storage: KeyStorage,
): Promise<ProviderActionResult> {
  const result = await desktopInvoke<MagentCommandResult>("magent_auth_add", {
    provider,
    key,
    storage,
  });
  const data = parseJson<{ ok?: boolean; error?: string; hint?: string }>(
    result,
  );
  // Exit 1 is a storage failure (usually no keyring backend in MagAgent's Python).
  // Fall back to MagAgent's owner-only config.toml and say so.
  if (storage === "keyring" && !result.ok && result.status === 1) {
    const fallback = await storeProviderKey(provider, key, "config");
    return fallback.ok
      ? {
          ok: true,
          message: `The system keychain was not available to MagAgent, so the key was saved to MagAgent's config.toml (readable only by you) for ${provider}.`,
        }
      : fallback;
  }
  if (result.ok && data?.ok !== false)
    return {
      ok: true,
      message:
        storage === "keyring"
          ? `Key saved to the system keychain for ${provider}.`
          : `Key saved to MagAgent's config.toml (owner-only permissions) for ${provider}.`,
    };
  return {
    ok: false,
    message: data?.error || failure(result),
    hint: data?.hint,
  };
}

/** Sends one short prompt through the provider. Only called when the user clicks Test. */
export async function testProvider(
  provider: string,
): Promise<ProviderActionResult> {
  const result = await runMagent(["provider", "test", provider]);
  const data = parseJson<{ ok?: boolean; model?: string }>(result);
  if (result.ok && data?.ok)
    return {
      ok: true,
      message: `${provider} answered${data.model ? ` using ${data.model}` : ""}.`,
    };
  return {
    ok: false,
    message: `${provider} did not answer. Check the key, your network, and the provider's status page.`,
  };
}

export async function makeDefaultProvider(
  provider: string,
): Promise<ProviderActionResult> {
  const result = await runMagent(["provider", "set", provider]);
  if (result.ok)
    return {
      ok: true,
      message:
        provider === MOCK_PROVIDER
          ? "Offline demo mode is on. Replies are canned and labeled; no model is called and no key is needed."
          : `${provider} is now MagAgent's default provider.`,
    };
  return { ok: false, message: failure(result) };
}

function failure(result: MagentCommandResult): string {
  const text = (result.stderr || result.stdout).trim();
  return (
    text.split(/\r?\n/).slice(-1)[0] || "MagAgent did not complete the request."
  );
}

const PROFILE_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function validProfileName(name: string): boolean {
  return PROFILE_NAME.test(name);
}

/** The active MagAgent user profile, or null when none exists yet (a fresh install). */
export async function currentProfile(): Promise<string | null> {
  const result = await runMagent(["user", "current"]);
  if (!result.ok) throw new Error(failure(result));
  const name = result.stdout.trim().split(/\r?\n/).slice(-1)[0]?.trim() ?? "";
  if (!name || /no active user/i.test(name)) return null;
  return name;
}

export async function createProfile(
  name: string,
): Promise<ProviderActionResult> {
  if (!validProfileName(name))
    return {
      ok: false,
      message:
        "Use 1 to 32 lowercase letters, digits, dashes, or underscores, starting with a letter or digit.",
    };
  const result = await runMagent(["user", "create", name]);
  if (result.ok)
    return {
      ok: true,
      message: `Created the MagAgent profile "${name}". Memory for your chats is stored under it.`,
    };
  return { ok: false, message: failure(result) };
}
