import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ArtifactPreview, ExecutionEvent, ExecutionTask, ProjectInspection } from "./lib/types";

export type MagentCommandResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  status: number | null;
};

export class MagentCommandError extends Error {
  constructor(
    message: string,
    readonly result: MagentCommandResult,
    readonly args: string[]
  ) {
    super(message);
    this.name = "MagentCommandError";
  }
}

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
  onEvent: (event: MagentStreamEvent) => void,
  options: { id?: string } = {}
): Promise<MagentCommandResult> {
  const id = options.id ?? crypto.randomUUID();
  const unlisten = await listen<MagentStreamEvent>("magent-stream", (event) => {
    if (event.payload.id === id) onEvent(event.payload);
  });
  try {
    return await invoke<MagentCommandResult>("run_magent_stream", { id, args });
  } finally {
    unlisten();
  }
}

export async function cancelMagentStream(id: string): Promise<boolean> {
  return invoke<boolean>("cancel_magent_stream", { id });
}

export async function runSetupCommand(program: string, args: string[]): Promise<MagentCommandResult> {
  return invoke<MagentCommandResult>("run_setup_command", { program, args });
}

export async function inspectProject(path: string): Promise<ProjectInspection> {
  return invoke<ProjectInspection>("inspect_project", { path });
}

export async function readProjectArtifact(project: string, path: string): Promise<ArtifactPreview> {
  return invoke<ArtifactPreview>("read_project_artifact", { project, path });
}

export function parseJson<T>(result: MagentCommandResult): T | null {
  const text = result.stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    const parsedLine = text
      .split(/\r?\n/)
      .reverse()
      .map((line) => line.trim())
      .find((line) => line.startsWith("{") && line.endsWith("}"));
    if (!parsedLine) return null;
    try {
      return JSON.parse(parsedLine) as T;
    } catch {
      return null;
    }
  }
}

function requireJson<T>(result: MagentCommandResult, args: string[]): T {
  const data = parseJson<T>(result);
  if (!result.ok || !data) {
    const message = result.stderr.trim() || result.stdout.trim() || `magent ${args.join(" ")} failed`;
    throw new MagentCommandError(message, result, args);
  }
  return data;
}

export const magentClient = {
  async createTask(title: string, project: string, sessionId: string): Promise<ExecutionTask> {
    const args = ["execution", "create", title, "--project", project, "--session", sessionId];
    const payload = requireJson<{ task: ExecutionTask }>(await runMagent(args), args);
    return payload.task;
  },
  async listTasks(limit = 100): Promise<ExecutionTask[]> {
    const args = ["execution", "list", "--limit", String(limit)];
    return requireJson<{ tasks: ExecutionTask[] }>(await runMagent(args), args).tasks;
  },
  async task(taskId: string): Promise<ExecutionTask> {
    const args = ["execution", "show", taskId];
    return requireJson<{ task: ExecutionTask }>(await runMagent(args), args).task;
  },
  async events(taskId: string, after = 0): Promise<ExecutionEvent[]> {
    const args = ["execution", "events", taskId, "--after", String(after)];
    return requireJson<{ events: ExecutionEvent[] }>(await runMagent(args), args).events;
  },
  async action(taskId: string, action: "pause" | "resume" | "cancel" | "retry"): Promise<ExecutionTask> {
    const args = ["execution", action, taskId];
    return requireJson<{ task: ExecutionTask }>(await runMagent(args), args).task;
  }
};
