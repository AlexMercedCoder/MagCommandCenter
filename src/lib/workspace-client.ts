import { desktopInvoke } from "./desktop";
import type {
  GitState,
  ProcessResult,
  WorkspaceFile,
  WorkspaceFilePreview,
} from "./types";

export const workspaceClient = {
  files(project: string, query = "") {
    return desktopInvoke<{ files: WorkspaceFile[]; truncated: boolean }>(
      "list_workspace_files",
      { project, query },
    );
  },
  adjacentProjects(project: string) {
    return desktopInvoke<
      Array<{
        name: string;
        path: string;
        current: boolean;
        launch_command: string;
      }>
    >("list_adjacent_projects", { project });
  },
  preview(project: string, path: string) {
    return desktopInvoke<WorkspaceFilePreview>("preview_workspace_file", {
      project,
      path,
    });
  },
  upload(project: string, name: string, dataBase64: string, sessionId: string) {
    return desktopInvoke<WorkspaceFile>("upload_workspace_file", {
      project,
      request: { name, data_base64: dataBase64, session_id: sessionId },
    });
  },
  context(project: string, paths: string[]) {
    return desktopInvoke<{
      prompt: string;
      references: Array<{ path: string; size: number; inline: boolean }>;
      inline_bytes: number;
    }>("build_workspace_context", { project, paths });
  },
  git(project: string) {
    return desktopInvoke<GitState>("workspace_git_state", { project });
  },
  diff(project: string, staged: boolean) {
    return desktopInvoke<ProcessResult>("workspace_git_diff", {
      project,
      staged,
    });
  },
  gitAction(
    project: string,
    action: "stage" | "unstage" | "discard",
    path: string,
  ) {
    return desktopInvoke<ProcessResult>("workspace_git_action", {
      project,
      action,
      path,
    });
  },
  createWorktree(
    project: string,
    branch: string,
    directory: string,
    createBranch: boolean,
  ) {
    return desktopInvoke<ProcessResult>("workspace_create_worktree", {
      project,
      branch,
      directory,
      createBranch,
    });
  },
  removeWorktree(project: string, directory: string) {
    return desktopInvoke<ProcessResult>("workspace_remove_worktree", {
      project,
      directory,
    });
  },
  command(project: string, argv: string[], timeoutSeconds = 60) {
    return desktopInvoke<ProcessResult>("run_workspace_command", {
      project,
      argv,
      timeoutSeconds,
    });
  },
};

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function parseArgv(value: string): string[] {
  const values: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const character of value.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = "";
      else current += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (escaped || quote)
    throw new Error("Command contains an unfinished quote or escape.");
  if (current) values.push(current);
  return values;
}
