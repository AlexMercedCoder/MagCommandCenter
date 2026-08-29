export type ShortcutAction =
  "palette" | "newSession" | "workspace" | "runs" | "graphs" | "tools" | "help";
export type ShortcutMap = Record<ShortcutAction, string>;

export const defaultShortcuts: ShortcutMap = {
  palette: "Mod+K",
  newSession: "Mod+Shift+N",
  workspace: "Mod+1",
  runs: "Mod+2",
  graphs: "Mod+3",
  tools: "Mod+4",
  help: "/",
};

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
