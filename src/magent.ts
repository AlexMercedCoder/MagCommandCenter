import { invoke } from "@tauri-apps/api/core";

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

export async function runSetupCommand(program: string, args: string[]): Promise<MagentCommandResult> {
  return invoke<MagentCommandResult>("run_setup_command", { program, args });
}

export function parseJson<T>(result: MagentCommandResult): T | null {
  if (!result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return null;
  }
}
