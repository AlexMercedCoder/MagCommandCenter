import { BookOpen, Brain, Database, Gauge, MessageSquareText, Plug, Search, Settings2, Wand2, Workflow } from "lucide-react";
import type { View } from "./types";

export const navItems: Array<{ id: View; label: string; icon: typeof Gauge; group: "Work" | "Knowledge" | "System" }> = [
  { id: "chat", label: "Agent Chat", icon: MessageSquareText, group: "Work" },
  { id: "dashboard", label: "Projects", icon: Gauge, group: "Work" },
  { id: "workbench", label: "Workbench", icon: Workflow, group: "Work" },
  { id: "research", label: "Research", icon: Search, group: "Work" },
  { id: "memory", label: "Memory", icon: Brain, group: "Knowledge" },
  { id: "sqlite", label: "SQLite", icon: Database, group: "Knowledge" },
  { id: "plugins", label: "Plugins", icon: Plug, group: "Knowledge" },
  { id: "config", label: "Settings", icon: Settings2, group: "System" },
  { id: "setup", label: "Setup", icon: Wand2, group: "System" },
  { id: "docs", label: "Help", icon: BookOpen, group: "System" }
];

export const defaultProject = "/home/alexmerced/development/personal/Personal/utility/2026/MagAgent";
export const minimumMagentVersion = "0.91.0";

export const activeExecutionStates = new Set(["queued", "planning", "ready", "running", "waiting", "awaiting_human", "validating"]);
export const terminalExecutionStates = new Set(["completed", "succeeded", "failed", "cancelled", "skipped"]);

export const storageKeys = {
  theme: "mcc.theme",
  project: "mcc.project",
  projects: "mcc.recentProjects",
  pinnedProjects: "mcc.pinnedProjects",
  chat: "mcc.chatHistory",
  chatSessions: "mcc.chatSessions",
  commands: "mcc.commandHistory",
  setupMethod: "mcc.setupMethod",
  setupDismissed: "mcc.setupDismissed",
  sqliteSavedQueries: "mcc.sqliteSavedQueries"
};

export const quickPrompts = [
  "Summarize this project and suggest the next useful task.",
  "Review the current project for UX issues and propose fixes.",
  "Inspect memory for stale or duplicate facts and suggest cleanups.",
  "Run a docs audit and list the highest-impact documentation gaps."
];

export const recipePrompts = [
  { name: "Release prep", command: ["recipe", "run", "release-prep", "--project"] },
  { name: "Docs audit", command: ["recipe", "run", "docs-audit", "--project"] },
  { name: "Test repair", command: ["recipe", "run", "test-repair", "--project"] }
];
