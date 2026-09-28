import { describe, expect, it } from "vitest";
import {
  defaultShortcuts,
  shortcutConflicts,
  withDefaults,
} from "./keybindings";
import { sectionOf, viewTitle } from "./navigation";

describe("navigation model", () => {
  it("groups every view under one of the primary sections", () => {
    expect(sectionOf("chat")).toBe("chat");
    expect(sectionOf("runs")).toBe("runs");
    for (const view of [
      "dashboard",
      "workspace",
      "graphs",
      "agents",
      "memory",
      "tools",
      "library",
    ] as const)
      expect(sectionOf(view)).toBe("projects");
    for (const view of ["config", "docs", "setup"] as const)
      expect(sectionOf(view)).toBe("settings");
  });

  it("titles views for the header", () => {
    expect(viewTitle("dashboard")).toBe("Projects");
    expect(viewTitle("workspace")).toBe("Files and Git");
    expect(viewTitle("graphs")).toBe("Graph Board");
  });

  it("fills new shortcut actions with defaults and has no conflicts", () => {
    expect(shortcutConflicts(defaultShortcuts)).toEqual([]);
    expect(withDefaults({ chat: "Mod+J", unknown: "X" })).toEqual({
      ...defaultShortcuts,
      chat: "Mod+J",
    });
  });
});
