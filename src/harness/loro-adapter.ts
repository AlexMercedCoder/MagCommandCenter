import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktopAvailable, runtimeTransportKind } from "../lib/desktop";
import { refreshApprovals } from "../lib/approvals";
import {
  parseJson,
  type MagentCommandResult,
  type MagentStreamEvent,
} from "../magent";
import type { HarnessAdapter, HarnessDetection } from "./types";

/**
 * Loro, the governed agent harness for data and platform teams, as a second backend.
 * Experimental in Command Center: chat runs with streaming, AAIS approvals, and Stop;
 * no durable MagAgent tasks, graphs, or memory evidence.
 */
export function loroRunArgs(request: { profile?: string }) {
  const args = ["run", "--json", "--approval-stdio"];
  if (request.profile) args.push("--agent", request.profile);
  return args;
}

function native() {
  if (!desktopAvailable())
    throw new Error("Loro needs the packaged desktop app.");
  if (runtimeTransportKind() !== "native")
    throw new Error(
      "Loro runs only on this computer; switch the remote runtime off to use it.",
    );
}

export const loroAdapter: HarnessAdapter = {
  id: "loro",
  label: "Loro",
  experimental: true,
  capabilities: {
    streaming: true,
    approvals: true,
    cancel: true,
    durableTasks: false,
    profiles: true,
    graphs: false,
    memory: false,
    remote: false,
  },
  async detect() {
    if (!desktopAvailable())
      return {
        available: false,
        command: "loro",
        error: "Desktop app required.",
      };
    return invoke<HarnessDetection>("harness_detect", { harness: "loro" });
  },
  async contracts() {
    const detected = await loroAdapter.detect();
    return {
      harness: "loro",
      version: detected.version ?? null,
      approvals: "aais.v1 (--approval-stdio)",
      output: "loro run --json",
    };
  },
  async ask(request, onEvent, options) {
    native();
    const unlisten = await listen<MagentStreamEvent>(
      "magent-stream",
      (event) => {
        if (event.payload.id !== options.id) return;
        if (
          event.payload.stream === "stdout" &&
          event.payload.line.includes("approval.")
        )
          void refreshApprovals().catch(() => undefined);
        onEvent(event.payload);
      },
    );
    try {
      const result = await invoke<MagentCommandResult>("run_harness_stream", {
        id: options.id,
        harness: "loro",
        args: loroRunArgs(request),
        // Delivered in an owner-only temp file (--prompt-file), not on argv.
        prompt: request.prompt,
        cwd: request.project || null,
      });
      const data = parseJson<Record<string, unknown>>(result);
      const response = typeof data?.response === "string" ? data.response : "";
      return {
        result,
        data,
        text:
          response ||
          result.stderr.trim() ||
          result.stdout.trim() ||
          "Loro returned no response.",
      };
    } finally {
      void refreshApprovals().catch(() => undefined);
      unlisten();
    }
  },
  decide: (streamId, line) =>
    invoke<boolean>("write_magent_stream", { id: streamId, line }),
  cancel: (streamId) =>
    invoke<boolean>("cancel_magent_stream", { id: streamId }),
};
