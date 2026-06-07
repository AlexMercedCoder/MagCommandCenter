import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProjectInspection } from "./lib/types";

export type MagentCommandResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  status: number | null;
};

export async function runMagent(args: string[]): Promise<MagentCommandResult> {
  return invoke<MagentCommandResult>("run_magent", { args });
}

export type MagentStreamEvent = {
  id: string;
  stream: "stdout" | "stderr";
  line: string;
};

export async function runMagentStream(
  args: string[],
  onEvent: (event: MagentStreamEvent) => void
): Promise<MagentCommandResult> {
  const id = crypto.randomUUID();
  const unlisten = await listen<MagentStreamEvent>("magent-stream", (event) => {
    if (event.payload.id === id) onEvent(event.payload);
  });
  try {
    return await invoke<MagentCommandResult>("run_magent_stream", { id, args });
  } finally {
    unlisten();
  }
}

export async function runSetupCommand(program: string, args: string[]): Promise<MagentCommandResult> {
  return invoke<MagentCommandResult>("run_setup_command", { program, args });
}

export async function inspectProject(path: string): Promise<ProjectInspection> {
  return invoke<ProjectInspection>("inspect_project", { path });
}

export function parseJson<T>(result: MagentCommandResult): T | null {
  if (!result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return null;
  }
}
