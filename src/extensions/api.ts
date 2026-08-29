import type { View } from "../lib/types";
import type { ReactNode } from "react";

export type CommandCenterExtension = {
  id: string;
  name: string;
  version: string;
  origin: "bundled" | "user" | "project";
  trusted: boolean;
  commands?: Array<{
    id: string;
    label: string;
    run: () => void | Promise<void>;
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
  extensions.set(extension.id, Object.freeze({ ...extension }));
  listeners.forEach((listener) => listener());
  return () => {
    extensions.delete(extension.id);
    listeners.forEach((listener) => listener());
  };
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
    };
  }
}

if (typeof window !== "undefined") {
  window.MagCommandCenter = Object.freeze({
    registerExtension,
    inventory: extensionInventory,
  });
}
