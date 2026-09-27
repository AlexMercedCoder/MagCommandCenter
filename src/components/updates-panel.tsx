import { listen } from "@tauri-apps/api/event";
import { Download, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { desktopAvailable, desktopInvoke } from "../lib/desktop";

type UpdateStatus = {
  configured: boolean;
  available: boolean;
  currentVersion: string;
  version?: string | null;
  notes?: string | null;
  date?: string | null;
};

type State =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "result"; status: UpdateStatus }
  | {
      phase: "installing";
      status: UpdateStatus;
      downloaded: number;
      total?: number;
    }
  | { phase: "error"; message: string };

const RELEASES = "https://github.com/AlexMercedCoder/MagCommandCenter/releases";

/** Settings panel for signed in-app updates (C-11). */
export function UpdatesPanel() {
  const [state, setState] = useState<State>({ phase: "idle" });

  useEffect(() => {
    if (!desktopAvailable()) return;
    let stop: (() => void) | undefined;
    let disposed = false;
    void listen<{ downloaded: number; total?: number }>(
      "update-progress",
      (event) =>
        setState((current) =>
          current.phase === "installing"
            ? { ...current, ...event.payload }
            : current,
        ),
    )
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);

  async function check() {
    setState({ phase: "checking" });
    try {
      setState({
        phase: "result",
        status: await desktopInvoke<UpdateStatus>("check_for_update"),
      });
    } catch (reason) {
      setState({
        phase: "error",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  async function install(status: UpdateStatus) {
    setState({ phase: "installing", status, downloaded: 0 });
    try {
      await desktopInvoke("install_update");
    } catch (reason) {
      setState({
        phase: "error",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  return (
    <section className="panel updates-panel" aria-labelledby="updates-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Version</p>
          <h3 id="updates-title">Updates</h3>
        </div>
        <Download aria-hidden="true" />
      </div>
      <div role="status" aria-live="polite" className="updates-status">
        {state.phase === "idle" && (
          <p className="field-help">
            Updates are signed. The app only installs a package whose signature
            matches the key built into this version.
          </p>
        )}
        {state.phase === "checking" && <p>Checking for updates…</p>}
        {state.phase === "error" && (
          <p className="updates-error">{state.message}</p>
        )}
        {state.phase === "result" && !state.status.configured && (
          <p>
            This build has no update channel (it was built without an updater
            key). Download new versions from{" "}
            <a href={RELEASES} target="_blank" rel="noreferrer">
              GitHub Releases
            </a>
            . You are on {state.status.currentVersion}.
          </p>
        )}
        {state.phase === "result" &&
          state.status.configured &&
          !state.status.available && (
            <p>
              You are on the latest version ({state.status.currentVersion}).
            </p>
          )}
        {state.phase === "result" && state.status.available && (
          <div className="update-available">
            <p>
              <strong>Version {state.status.version} is available</strong> (you
              have {state.status.currentVersion}).
            </p>
            {state.status.notes && (
              <details>
                <summary>What changed</summary>
                <pre>{state.status.notes}</pre>
              </details>
            )}
          </div>
        )}
        {state.phase === "installing" && (
          <p>
            Downloading {state.status.version}
            {state.total
              ? ` (${Math.round((state.downloaded / state.total) * 100)}%)`
              : "…"}{" "}
            The app restarts when the update is installed.
          </p>
        )}
      </div>
      <div className="row-actions">
        <button
          className="icon-action"
          type="button"
          onClick={() => void check()}
          disabled={state.phase === "checking" || state.phase === "installing"}
        >
          <RefreshCcw size={16} />
          <span>Check for updates</span>
        </button>
        {state.phase === "result" && state.status.available && (
          <button
            className="primary-action"
            type="button"
            onClick={() => void install(state.status)}
          >
            <Download size={16} />
            <span>Install and restart</span>
          </button>
        )}
      </div>
    </section>
  );
}
