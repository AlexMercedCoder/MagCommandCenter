import { desktopInvoke } from "../lib/desktop";
import { summarizeChatResponse } from "../lib/utils";
import {
  cancelMagentStream,
  magentClient,
  parseJson,
  runMagentStream,
  runSetupCommand,
} from "../magent";
import type { HarnessAdapter } from "./types";

export function magentAskArgs(request: {
  project: string;
  profile?: string;
  permissionMode?: string;
  executionTaskId?: string;
  prompt: string;
}) {
  const args = ["ask", "--json", "--events", "--project", request.project];
  if (request.profile) args.push("--agent", request.profile);
  if (request.executionTaskId)
    args.push("--execution-task-id", request.executionTaskId);
  args.push("--repair-attempts", "1");
  if (request.permissionMode)
    args.push("--permission-mode", request.permissionMode);
  args.push(request.prompt);
  return args;
}

export const magentAdapter: HarnessAdapter = {
  id: "magent",
  label: "MagAgent",
  experimental: false,
  capabilities: {
    streaming: true,
    approvals: true,
    cancel: true,
    durableTasks: true,
    profiles: true,
    graphs: true,
    memory: true,
    remote: true,
  },
  async detect() {
    const result = await runSetupCommand("magent", ["--version"]);
    const version = /(\d+\.\d+\.\d+\S*)/.exec(result.stdout)?.[1] ?? null;
    return {
      available: result.ok,
      version,
      command: result.command,
      error: result.ok ? null : result.stderr,
    };
  },
  contracts: () => magentClient.contracts(),
  async ask(request, onEvent, options) {
    const result = await runMagentStream(
      magentAskArgs(request),
      onEvent,
      options,
    );
    const data = parseJson<Record<string, unknown>>(result);
    return {
      result,
      data,
      text:
        summarizeChatResponse(data) ||
        result.stderr ||
        result.stdout ||
        "No response body returned.",
    };
  },
  decide: (streamId, line) =>
    desktopInvoke<boolean>("write_magent_stream", { id: streamId, line }),
  cancel: (streamId) => cancelMagentStream(streamId),
};
