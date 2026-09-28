import { open } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { performanceReport } from "../lib/performance";
import type {
  CacheReadiness,
  EcosystemReadiness,
  ProviderDetection,
  Readiness,
  SystemInfo,
  ToolReadiness,
} from "../lib/types";
import { parseVersion } from "../lib/utils";
import {
  inspectProject,
  parseJson,
  runMagent,
  runSetupCommand,
  saveDiagnosticsBundle,
  type MagentCommandResult,
} from "../magent";
import { useAppStore } from "./app-store";

const app = () => useAppStore.getState();

function failureMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

/** Runs a MagAgent command, records it, and hands parsed JSON to `onData`. */
export async function executeJson<T>(
  args: string[],
  onData: (data: T | null, result: MagentCommandResult) => void,
) {
  app().setBusy(true);
  try {
    const result = await runMagent(args);
    app().recordCommand(result);
    onData(parseJson<T>(result), result);
  } catch (reason) {
    app().notify(
      failureMessage(reason, "MagAgent command failed to start"),
      "bad",
    );
  } finally {
    app().setBusy(false);
  }
}

export async function executeCommand(args: string[], after?: () => void) {
  app().setBusy(true);
  try {
    const result = await runMagent(args);
    app().recordCommand(result);
    after?.();
  } catch (reason) {
    app().notify(
      failureMessage(reason, "MagAgent command failed to start"),
      "bad",
    );
  } finally {
    app().setBusy(false);
  }
}

export async function detectMagent() {
  const { setBusy, recordCommand, set } = app();
  setBusy(true);
  try {
    const setupCheck = await runSetupCommand("magent", ["--version"]);
    // Routine probes: Setup's diagnostics explain failures, so no toasts.
    recordCommand(setupCheck, false);
    const version = parseVersion(setupCheck.stdout || setupCheck.stderr);
    if (setupCheck.ok && version) set({ system: { magent_version: version } });
    const result = await runMagent(["system", "info"]);
    recordCommand(result, false);
    const data = parseJson<SystemInfo>(result);
    if (data) set({ system: data });
    const contractResult = await runMagent(["system", "contracts"]);
    recordCommand(contractResult, false);
    const contracts = parseJson<{
      schema?: string;
      contracts?: SystemInfo["contracts"];
    }>(contractResult);
    if (contracts?.contracts) {
      set({
        system: {
          ...app().system,
          contract_schema: contracts.schema,
          contracts: contracts.contracts,
        },
      });
    }
  } finally {
    setBusy(false);
  }
}

export async function installMagent() {
  const { setBusy, recordCommand, setupMethod } = app();
  setBusy(true);
  try {
    const command =
      setupMethod === "pipx-install"
        ? { program: "pipx", args: ["install", "mag-agent"] }
        : setupMethod === "pipx-upgrade"
          ? { program: "pipx", args: ["upgrade", "mag-agent"] }
          : {
              program: "python3",
              args: ["-m", "pip", "install", "--user", "-U", "mag-agent"],
            };
    const result = await runSetupCommand(command.program, command.args);
    recordCommand(result);
    await detectMagent();
  } finally {
    setBusy(false);
  }
}

export async function chooseProjectFolder() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open MagAgent project",
  });
  if (typeof selected === "string") app().rememberProject(selected);
}

export async function runReadiness() {
  app().rememberProject();
  await executeJson<Readiness>(
    ["readiness", "--project", app().project],
    (data) => app().set({ readiness: data }),
  );
}

export async function runEcosystemReadiness() {
  await executeJson<EcosystemReadiness>(
    ["system", "ecosystem-report", "--root", app().project],
    (data) => app().set({ ecosystemReadiness: data }),
  );
}

export async function runEnvironmentDiagnostics() {
  const { setBusy, recordCommand, notify, set } = app();
  setBusy(true);
  try {
    const [tools, providers, cache] = await Promise.all([
      runMagent(["tools", "doctor"]),
      runMagent(["provider", "detect"]),
      runMagent(["cache", "doctor", "--json"]),
    ]);
    set({
      toolReadiness: parseJson<ToolReadiness>(tools),
      providerDetection: parseJson<ProviderDetection>(providers),
      cacheReadiness: parseJson<CacheReadiness>(cache),
    });
    [tools, providers, cache].forEach((result) => recordCommand(result, false));
    const ok = tools.ok && providers.ok && cache.ok;
    notify(
      ok
        ? "Environment diagnostics are ready"
        : "Some environment checks need review",
      ok ? "good" : "bad",
    );
  } catch (reason) {
    notify(
      failureMessage(reason, "Environment diagnostics failed to start"),
      "bad",
    );
  } finally {
    setBusy(false);
  }
}

export async function refreshProjectHealth() {
  const { setBusy, notify, set, project } = app();
  setBusy(true);
  try {
    const inspection = await inspectProject(project);
    set({ projectInspection: inspection });
    notify("Project health inspected", inspection.exists ? "good" : "bad");
  } finally {
    setBusy(false);
  }
}

export async function exportDiagnostics() {
  const { setBusy, notify, project } = app();
  setBusy(true);
  try {
    const path = await saveDiagnosticsBundle(project, performanceReport());
    notify(`Redacted diagnostics saved to ${path}`, "good");
  } catch (reason) {
    notify(failureMessage(reason, "Could not save diagnostics"), "bad");
  } finally {
    setBusy(false);
  }
}

/** Asks the OS for notification permission and turns both notification kinds on. */
export async function enableNotifications() {
  const { notify, set } = app();
  try {
    const granted =
      (await isPermissionGranted()) ||
      (await requestPermission()) === "granted";
    if (!granted) {
      notify(
        "Notifications are blocked. Allow Mag Command Center in your system notification settings.",
        "info",
      );
      return;
    }
    set({ notifications: { approvals: true, runs: true } });
    notify(
      "You will be notified about approvals and finished runs while the window is in the background.",
      "good",
    );
  } catch {
    notify("Desktop notifications need the packaged desktop app.", "bad");
  }
}
