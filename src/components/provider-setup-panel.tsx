import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  KeyRound,
  PlugZap,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  MOCK_PROVIDER,
  authStatus,
  createProfile,
  currentProfile,
  validProfileName,
  listProviders,
  makeDefaultProvider,
  storeProviderKey,
  testProvider,
  type AuthStatus,
  type KeyStorage,
  type ProviderOption,
} from "../lib/providers";
import type { Toast } from "../lib/types";

type Status =
  | { state: "idle" }
  | { state: "working"; label: string }
  | { state: "done"; ok: boolean; message: string; hint?: string };

export function ProviderSetupPanel(props: {
  notify: (text: string, tone?: Toast["tone"]) => void;
  /** Called after a change that affects readiness, so the app can re-detect. */
  onChanged?: () => void;
}) {
  const { notify, onChanged } = props;
  const [providers, setProviders] = useState<ProviderOption[] | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [provider, setProvider] = useState("");
  const [storage, setStorage] = useState<KeyStorage>("keyring");
  const [makeDefault, setMakeDefault] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  // undefined while loading, null when MagAgent has no profile yet.
  const [profile, setProfile] = useState<string | null | undefined>(undefined);
  const [profileName, setProfileName] = useState("me");
  // The key lives only in the input element, never in React state, so it cannot leak
  // into state snapshots, persistence, or error reports.
  const keyInput = useRef<HTMLInputElement>(null);
  const ids = useId();

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const [list, status, active] = await Promise.all([
        listProviders(),
        authStatus(),
        currentProfile(),
      ]);
      setProfile(active);
      const keyed = list.filter((item) => !item.local);
      setProviders(keyed);
      setAuth(status);
      setStorage(status.keyringAvailable ? "keyring" : "config");
      setProvider((current) => current || keyed[0]?.id || "");
    } catch (reason) {
      setLoadError(
        reason instanceof Error
          ? reason.message
          : "MagAgent could not list providers.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const busy = status.state === "working";
  const selected = providers?.find((item) => item.id === provider);
  const stored = auth?.configured[provider];

  async function run(
    label: string,
    action: () => Promise<{ ok: boolean; message: string; hint?: string }>,
  ) {
    setStatus({ state: "working", label });
    try {
      const result = await action();
      setStatus({ state: "done", ...result });
      notify(result.message, result.ok ? "good" : "bad");
      return result.ok;
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "The request failed.";
      setStatus({ state: "done", ok: false, message });
      notify(message, "bad");
      return false;
    }
  }

  async function save() {
    const key = keyInput.current?.value ?? "";
    const ok = await run("Saving key", async () => {
      const saved = await storeProviderKey(provider, key, storage);
      if (!saved.ok || !makeDefault) return saved;
      const selectedDefault = await makeDefaultProvider(provider);
      return selectedDefault.ok
        ? {
            ok: true,
            message: `${saved.message} ${provider} is now the default.`,
          }
        : selectedDefault;
    });
    if (ok && keyInput.current) {
      keyInput.current.value = "";
      setHasKey(false);
      setReveal(false);
    }
    if (ok) {
      await refresh();
      onChanged?.();
    }
  }

  async function createLocalProfile() {
    const name = profileName.trim();
    const ok = await run("Creating profile", () => createProfile(name));
    if (ok) {
      setProfile(name);
      onChanged?.();
    }
  }

  async function offline() {
    const ok = await run("Turning on offline demo", () =>
      makeDefaultProvider(MOCK_PROVIDER),
    );
    if (ok) onChanged?.();
  }

  return (
    <section
      className="panel provider-setup"
      aria-labelledby={`${ids}-title`}
      aria-busy={busy}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Model provider</p>
          <h3 id={`${ids}-title`}>Connect a model</h3>
        </div>
        <KeyRound aria-hidden="true" />
      </div>
      <p className="field-help">
        Paste an API key and MagAgent stores it in your system keychain (or its
        owner-only config file). The key is sent to MagAgent over a private
        pipe; it is not shown in process lists, logs, or this app&apos;s saved
        state.
      </p>

      {profile === null && !loadError && (
        <form
          className="provider-profile"
          onSubmit={(event) => {
            event.preventDefault();
            void createLocalProfile();
          }}
        >
          <div>
            <strong>
              <UserRound size={16} aria-hidden="true" /> Step 1: create your
              local profile
            </strong>
            <p className="field-help">
              MagAgent keeps memory and settings per profile on this computer.
              Chats need one; you can add more later.
            </p>
          </div>
          <label htmlFor={`${ids}-profile`}>Profile name</label>
          <div className="secret-field">
            <input
              id={`${ids}-profile`}
              value={profileName}
              onChange={(event) =>
                setProfileName(event.target.value.toLowerCase())
              }
              aria-invalid={!validProfileName(profileName.trim())}
              disabled={busy}
            />
            <button
              type="submit"
              className="primary-action"
              disabled={busy || !validProfileName(profileName.trim())}
            >
              <span>Create profile</span>
            </button>
          </div>
        </form>
      )}

      {loadError ? (
        <div className="provider-setup-error" role="alert">
          <strong>Providers could not be loaded.</strong> {loadError}{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        </div>
      ) : !providers ? (
        <p className="field-help" role="status">
          Loading providers…
        </p>
      ) : (
        <form
          className="provider-setup-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor={`${ids}-provider`}>Provider</label>
          <select
            id={`${ids}-provider`}
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            disabled={busy}
          >
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {auth?.configured[item.id] ? " (key saved)" : ""}
              </option>
            ))}
          </select>
          {selected?.envPresent && (
            <p className="field-help">
              {selected.envName || "An environment variable"} is already set for
              this provider; a saved key is only needed if you launch the app
              without it.
            </p>
          )}
          {stored && (
            <p className="field-help">
              A key is already saved ({stored}). Saving again replaces it.
            </p>
          )}

          <label htmlFor={`${ids}-key`}>API key</label>
          <div className="secret-field">
            <input
              id={`${ids}-key`}
              ref={keyInput}
              type={reveal ? "text" : "password"}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Paste the key"
              onChange={(event) => setHasKey(event.target.value.trim() !== "")}
              disabled={busy}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={reveal ? "Hide key" : "Show key"}
              aria-pressed={reveal}
              onClick={() => setReveal((value) => !value)}
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <fieldset className="provider-storage" disabled={busy}>
            <legend>Store it in</legend>
            <label className="check-option">
              <input
                type="radio"
                name={`${ids}-storage`}
                checked={storage === "keyring"}
                disabled={!auth?.keyringAvailable}
                onChange={() => setStorage("keyring")}
              />
              <span>
                System keychain
                {!auth?.keyringAvailable && " (not available to MagAgent here)"}
              </span>
            </label>
            <label className="check-option">
              <input
                type="radio"
                name={`${ids}-storage`}
                checked={storage === "config"}
                onChange={() => setStorage("config")}
              />
              <span>MagAgent config file, readable only by you</span>
            </label>
          </fieldset>
          <label className="check-option">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(event) => setMakeDefault(event.target.checked)}
              disabled={busy}
            />
            <span>Use this provider by default</span>
          </label>

          <div className="row-actions">
            <button
              type="submit"
              className="primary-action"
              disabled={busy || !provider || !hasKey}
            >
              <KeyRound size={16} />
              <span>Save key</span>
            </button>
            <button
              type="button"
              className="icon-action"
              disabled={busy || !provider || !(stored || selected?.envPresent)}
              title="Sends one short prompt through the provider. Your provider may bill it."
              onClick={() =>
                void run("Testing connection", () => testProvider(provider))
              }
            >
              <PlugZap size={16} />
              <span>Test connection</span>
            </button>
          </div>
          <p className="field-help">
            Test sends one short prompt to the provider, which may bill a
            fraction of a cent. It only runs when you click it.
          </p>
        </form>
      )}

      <div className="provider-offline">
        <div>
          <strong>No key yet?</strong>
          <p className="field-help">
            Try MagAgent offline. The mock provider returns labeled, canned
            replies without calling a model, so you can explore chat, runs, and
            approvals first. Pick a real provider above whenever you are ready.
          </p>
        </div>
        <button
          type="button"
          className="icon-action"
          disabled={busy || !profile}
          title={profile ? undefined : "Create your profile first"}
          onClick={() => void offline()}
        >
          <Sparkles size={16} />
          <span>Start offline demo</span>
        </button>
      </div>

      <p className="provider-status" role="status" aria-live="polite">
        {status.state === "working"
          ? `${status.label}…`
          : status.state === "done"
            ? `${status.message}${status.hint ? ` ${status.hint}` : ""}`
            : ""}
      </p>
    </section>
  );
}
