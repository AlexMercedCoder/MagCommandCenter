export type ShortcutAction =
  | "palette"
  | "newSession"
  | "chat"
  | "runs"
  | "projects"
  | "workspace"
  | "graphs"
  | "settings"
  | "help";
export type ShortcutMap = Record<ShortcutAction, string>;

export const defaultShortcuts: ShortcutMap = {
  palette: "Mod+K",
  newSession: "Mod+Shift+N",
  chat: "Mod+1",
  runs: "Mod+2",
  projects: "Mod+3",
  workspace: "Mod+4",
  graphs: "Mod+5",
  settings: "Mod+,",
  help: "/",
};

/** Stored shortcuts, filled in with defaults for actions added since they were saved. */
export function withDefaults(
  stored: Partial<Record<string, string>>,
): ShortcutMap {
  const merged = { ...defaultShortcuts };
  for (const action of Object.keys(defaultShortcuts) as ShortcutAction[]) {
    const value = stored[action];
    if (typeof value === "string" && value.trim()) merged[action] = value;
  }
  return merged;
}

export function normalizeShortcut(value: string) {
  return value
    .split("+")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const lower = item.toLowerCase();
      if (["cmd", "ctrl", "command", "control", "mod"].includes(lower))
        return "Mod";
      if (lower === "shift") return "Shift";
      if (lower === "alt" || lower === "option") return "Alt";
      return item.length === 1 ? item.toUpperCase() : item;
    })
    .join("+");
}

export function shortcutFromEvent(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!["Control", "Meta", "Shift", "Alt"].includes(key)) parts.push(key);
  return parts.join("+");
}

export function shortcutConflicts(shortcuts: ShortcutMap) {
  const seen = new Map<string, ShortcutAction[]>();
  for (const [action, value] of Object.entries(shortcuts) as Array<
    [ShortcutAction, string]
  >) {
    const normalized = normalizeShortcut(value);
    seen.set(normalized, [...(seen.get(normalized) || []), action]);
  }
  return [...seen.entries()].filter(([, actions]) => actions.length > 1);
}
