import { describe, expect, it } from "vitest";
import {
  defaultShortcuts,
  normalizeShortcut,
  shortcutConflicts,
} from "./keybindings";

describe("keyboard shortcuts", () => {
  it("normalizes platform modifier aliases", () => {
    expect(normalizeShortcut("ctrl+shift+n")).toBe("Mod+Shift+N");
    expect(normalizeShortcut("cmd+k")).toBe("Mod+K");
  });

  it("reports conflicting bindings", () => {
    expect(shortcutConflicts({ ...defaultShortcuts, runs: "Ctrl+K" })).toEqual([
      ["Mod+K", ["palette", "runs"]],
    ]);
  });
});
