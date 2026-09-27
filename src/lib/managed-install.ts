import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktopAvailable, DesktopUnavailableError } from "./desktop";

/** Native `managed.json`: a completed private MagAgent install. */
export type ManagedManifest = {
  schema: string;
  magent_version: string;
  env: string;
  python: string;
  uv: string;
  uv_source: "system" | "downloaded" | "configured";
  requirements: string[];
  installed_at: number;
};

export type ManagedStatus = {
  root: string;
  installed: ManagedManifest | null;
  magent: string | null;
  running: boolean;
  system_uv: string | null;
  uv_download_available: boolean;
  pinned_magent: string;
  pinned_python: string;
  pinned_uv: string;
};

export type ManagedStepId = "uv" | "python" | "venv" | "magent" | "verify";

export type ManagedProgressEvent = {
  step: ManagedStepId | "done" | "error";
  index: number;
  total: number;
  label: string;
  state: "running" | "done" | "failed" | "cancelled";
  line: string | null;
};

export type StepState = "pending" | "running" | "done" | "failed";

export type InstallRun = {
  phase: "idle" | "running" | "done" | "failed" | "cancelled";
  steps: Record<ManagedStepId, { state: StepState; detail?: string }>;
  current?: ManagedStepId;
  lines: string[];
  message?: string;
};

export const managedSteps: ManagedStepId[] = [
  "uv",
  "python",
  "venv",
  "magent",
  "verify",
];

const MAX_LINES = 200;

export function idleRun(): InstallRun {
  return {
    phase: "idle",
    steps: Object.fromEntries(
      managedSteps.map((step) => [step, { state: "pending" }]),
    ) as InstallRun["steps"],
    lines: [],
  };
}

export function startedRun(): InstallRun {
  return { ...idleRun(), phase: "running" };
}

/** Folds one native progress event into the run state. */
export function applyProgress(
  run: InstallRun,
  event: ManagedProgressEvent,
): InstallRun {
  if (event.line) {
    const lines = [...run.lines, event.line];
    return {
      ...run,
      lines: lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines,
    };
  }
  if (event.step === "error") {
    const steps = { ...run.steps };
    if (run.current && steps[run.current].state === "running")
      steps[run.current] = {
        ...steps[run.current],
        state: "failed",
      };
    return {
      ...run,
      steps,
      phase: event.state === "cancelled" ? "cancelled" : "failed",
      message: event.label,
    };
  }
  if (event.step === "done")
    return { ...run, phase: "done", message: event.label };
  const state: StepState = event.state === "done" ? "done" : "running";
  return {
    ...run,
    current: event.step,
    steps: {
      ...run.steps,
      [event.step]: { state, detail: event.label },
    },
  };
}

/** Completed steps as a 0-100 value for the progress bar. */
export function runPercent(run: InstallRun) {
  const done = managedSteps.filter(
    (step) => run.steps[step].state === "done",
  ).length;
  return Math.round((done / managedSteps.length) * 100);
}

// The managed install always targets this computer, even while the remote runtime is
// connected, so these call native IPC directly rather than the runtime transport.
function native<T>(command: string) {
  if (!desktopAvailable()) return Promise.reject(new DesktopUnavailableError());
  return invoke<T>(command);
}

export const managedInstall = {
  status: () => native<ManagedStatus>("managed_install_status"),
  start: () => native<ManagedManifest>("managed_install_start"),
  cancel: () => native<boolean>("managed_install_cancel"),
  remove: () => native<void>("managed_install_remove"),
  onProgress(callback: (event: ManagedProgressEvent) => void) {
    if (!desktopAvailable()) return Promise.resolve(() => undefined);
    return listen<ManagedProgressEvent>("managed-install-progress", (event) =>
      callback(event.payload),
    );
  },
};
