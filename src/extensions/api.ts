import type { View } from "../lib/types";
import type { ReactNode } from "react";
import { desktopInvoke } from "../lib/desktop";

/**
 * Native commands an extension may declare in `ipc` (C-9). All are read-only views of
 * the runtime or the active project. Anything that runs processes, writes files, or
 * changes settings is not available to extensions.
 */
export const EXTENSION_IPC_COMMANDS = [
  "runtime_info",
  "approval_snapshot",
  "inspect_project",
  "list_workspace_files",
  "preview_workspace_file",
  "workspace_git_state",
  "workspace_git_diff",
] as const;
export type ExtensionIpcCommand = (typeof EXTENSION_IPC_COMMANDS)[number];

/** Passed to extension commands; `invoke` only reaches commands the manifest declared. */
export type ExtensionContext = {
  invoke: <T>(
    command: ExtensionIpcCommand,
    args?: Record<string, unknown>,
  ) => Promise<T>;
};

export type CommandCenterExtension = {
  id: string;
  name: string;
  version: string;
  origin: "bundled" | "user" | "project";
  trusted: boolean;
  /** Native commands this extension needs; must come from EXTENSION_IPC_COMMANDS. */
  ipc?: ExtensionIpcCommand[];
  commands?: Array<{
    id: string;
    label: string;
    run: (context: ExtensionContext) => void | Promise<void>;
  }>;
  inspectors?: Array<{
    id: string;
    title: string;
    supports: (value: unknown) => boolean;
    render: (value: unknown) => ReactNode;
  }>;
  navigation?: Array<{ id: string; label: string; target: View }>;
};

const extensions = new Map<string, CommandCenterExtension>();
const listeners = new Set<() => void>();

export function registerExtension(extension: CommandCenterExtension) {
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(extension.id))
    throw new Error("Extension id is invalid.");
  if (
    (extension.origin === "project" || extension.origin === "user") &&
    !extension.trusted
  ) {
    throw new Error(
      "User and project extensions require an explicit trust grant before registration.",
    );
  }
  const undeclared = (extension.ipc ?? []).filter(
    (command) =>
      !(EXTENSION_IPC_COMMANDS as readonly string[]).includes(command),
  );
  if (undeclared.length)
    throw new Error(
      `Extensions cannot use ${undeclared.join(", ")}. Allowed: ${EXTENSION_IPC_COMMANDS.join(", ")}.`,
    );
  extensions.set(
    extension.id,
    Object.freeze({ ...extension, ipc: [...(extension.ipc ?? [])] }),
  );
  listeners.forEach((listener) => listener());
  return () => {
    extensions.delete(extension.id);
    listeners.forEach((listener) => listener());
  };
}

/** A context whose `invoke` enforces the extension's declared `ipc` list. */
export function extensionContext(id: string): ExtensionContext {
  return {
    invoke: async <T>(
      command: ExtensionIpcCommand,
      args: Record<string, unknown> = {},
    ) => {
      const extension = extensions.get(id);
      if (!extension) throw new Error(`Extension ${id} is not registered.`);
      if (!extension.ipc?.includes(command))
        throw new Error(
          `Extension ${id} did not declare "${command}" in its ipc manifest.`,
        );
      return desktopInvoke<T>(command, args);
    },
  };
}

/** Runs an extension command with its scoped context. */
export async function runExtensionCommand(id: string, commandId: string) {
  const command = extensions
    .get(id)
    ?.commands?.find((item) => item.id === commandId);
  if (!command)
    throw new Error(`Unknown extension command ${id}/${commandId}.`);
  await command.run(extensionContext(id));
}

export function extensionInventory() {
  return [...extensions.values()];
}

export function subscribeExtensions(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

declare global {
  interface Window {
    MagCommandCenter?: {
      registerExtension: typeof registerExtension;
      inventory: typeof extensionInventory;
      run: typeof runExtensionCommand;
    };
  }
}

if (typeof window !== "undefined") {
  window.MagCommandCenter = Object.freeze({
    registerExtension,
    inventory: extensionInventory,
    run: runExtensionCommand,
  });
}
