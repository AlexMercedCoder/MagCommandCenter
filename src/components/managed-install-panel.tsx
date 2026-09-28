import {
  CheckCircle2,
  Circle,
  Download,
  LoaderCircle,
  PackageCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyProgress,
  idleRun,
  managedInstall,
  managedSteps,
  runPercent,
  startedRun,
  type InstallRun,
  type ManagedStatus,
  type ManagedStepId,
  type StepState,
} from "../lib/managed-install";
import { ExperimentalBadge } from "./experimental-badge";

const stepTitle = (step: ManagedStepId, status: ManagedStatus | null) =>
  ({
    uv: "Get uv",
    python: `Python ${status?.pinned_python ?? ""}`.trim(),
    venv: "Private environment",
    magent: `MagAgent ${status?.pinned_magent ?? ""}`.trim(),
    verify: "Check magent",
  })[step];

function StepIcon(props: { state: StepState }) {
  if (props.state === "done")
    return <CheckCircle2 size={16} aria-hidden="true" />;
  if (props.state === "failed") return <XCircle size={16} aria-hidden="true" />;
  if (props.state === "running")
    return <LoaderCircle size={16} aria-hidden="true" className="spin" />;
  return <Circle size={16} aria-hidden="true" />;
}

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);

/**
 * Setup > Managed install (Phase 6, experimental): a private uv-managed Python and a
 * pinned MagAgent in the app's data folder, with step progress, a log, and Cancel.
 */
export function ManagedInstallPanel(props: {
  notify: (message: string, tone?: "good" | "bad" | "info") => void;
  onInstalled: () => void;
}) {
  const [status, setStatus] = useState<ManagedStatus | null>(null);
  const [run, setRun] = useState<InstallRun>(idleRun);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await managedInstall.status();
      if (!next) throw new Error("the desktop runtime returned no status");
      setStatus(next);
      if (next.running) setRun((current) => ({ ...current, phase: "running" }));
    } catch (reason) {
      setUnavailable(message(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let stop: (() => void) | undefined;
    let disposed = false;
    void managedInstall
      .onProgress((event) => setRun((current) => applyProgress(current, event)))
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      stop?.();
    };
  }, [refresh]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [run.lines.length]);

  async function install() {
    setRun(startedRun());
    try {
      const manifest = await managedInstall.start();
      props.notify(
        `MagAgent ${manifest.magent_version} is installed in Command Center's private folder.`,
        "good",
      );
      props.onInstalled();
    } catch (reason) {
      setRun((current) =>
        current.phase === "running"
          ? { ...current, phase: "failed", message: message(reason) }
          : current,
      );
    } finally {
      await refresh();
    }
  }

  async function remove() {
    if (
      !window.confirm(
        "Remove the managed MagAgent? This deletes its private Python, environment, and downloaded uv. Your projects, chats, and MagAgent profile are not touched.",
      )
    )
      return;
    try {
      await managedInstall.remove();
      setRun(idleRun());
      props.notify("Managed MagAgent removed.", "good");
      props.onInstalled();
    } catch (reason) {
      props.notify(message(reason), "bad");
    } finally {
      await refresh();
    }
  }

  const installed = status?.installed ?? null;
  const running = run.phase === "running";
  const uvSource = status?.system_uv
    ? `Uses the uv already installed at ${status.system_uv}.`
    : status?.uv_download_available
      ? `Downloads uv ${status.pinned_uv} from GitHub and checks it against a SHA-256 digest built into the app.`
      : "uv has no build for this platform. Install uv yourself, then retry.";

  return (
    <section
      className="panel managed-install-panel"
      aria-labelledby="managed-install-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">No Python needed</p>
          <h3 id="managed-install-title">
            Managed install <ExperimentalBadge />
          </h3>
        </div>
        <PackageCheck aria-hidden="true" />
      </div>
      {unavailable ? (
        <p className="field-help">
          Managed install needs the desktop app ({unavailable}).
        </p>
      ) : (
        <>
          <p className="field-help">
            Command Center sets up its own MagAgent{" "}
            {status ? status.pinned_magent : ""} with uv: a private Python{" "}
            {status ? status.pinned_python : ""} and virtual environment in the
            app&apos;s data folder. Nothing is added to PATH or your shell, your
            uv settings are ignored, and Remove deletes all of it. Needs a
            network connection and about 400 MB of disk.
          </p>
          {installed && !running && (
            <p className="managed-installed">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>
                MagAgent <strong>{installed.magent_version}</strong> is
                installed and used for every run.
              </span>
            </p>
          )}
          <dl className="managed-facts">
            <div>
              <dt>uv</dt>
              <dd>
                {installed && !running
                  ? `${installed.uv} (${installed.uv_source})`
                  : uvSource}
              </dd>
            </div>
            <div>
              <dt>Folder</dt>
              <dd>
                <code>{status?.root ?? "…"}</code>
              </dd>
            </div>
          </dl>

          {run.phase !== "idle" && (
            <div className="managed-run">
              <div
                className="managed-progress"
                role="progressbar"
                aria-label="Managed install progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={runPercent(run)}
              >
                <span style={{ width: `${runPercent(run)}%` }} />
              </div>
              <ol className="managed-steps">
                {managedSteps.map((step) => (
                  <li
                    key={step}
                    className={`managed-step ${run.steps[step].state}`}
                  >
                    <StepIcon state={run.steps[step].state} />
                    <span>
                      <strong>{stepTitle(step, status)}</strong>
                      {run.steps[step].detail && (
                        <small>{run.steps[step].detail}</small>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p
                className={`managed-message ${run.phase}`}
                role="status"
                aria-live="polite"
              >
                {run.phase === "running"
                  ? "Installing… you can keep using the app."
                  : run.message}
              </p>
              {run.lines.length > 0 && (
                <details className="managed-log" open={run.phase === "failed"}>
                  <summary>
                    Install log ({run.lines.length}{" "}
                    {run.lines.length === 1 ? "line" : "lines"})
                  </summary>
                  <pre ref={logRef}>{run.lines.join("\n")}</pre>
                </details>
              )}
            </div>
          )}

          <div className="button-row">
            {running ? (
              <button
                type="button"
                className="icon-action"
                onClick={() => void managedInstall.cancel()}
              >
                <XCircle size={16} />
                <span>Cancel install</span>
              </button>
            ) : (
              <button
                type="button"
                className="primary-action"
                onClick={() => void install()}
                disabled={!status}
              >
                <Download size={16} />
                <span>
                  {installed
                    ? "Reinstall"
                    : `Install MagAgent ${status?.pinned_magent ?? ""}`}
                </span>
              </button>
            )}
            {installed && !running && (
              <button
                type="button"
                className="icon-action managed-remove"
                onClick={() => void remove()}
              >
                <Trash2 size={16} />
                <span>Remove</span>
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
