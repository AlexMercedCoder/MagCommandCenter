import { BookOpen, Brain, Database, Gauge, MessageSquareText, Plug, Search, Settings2, Wand2, Workflow } from "lucide-react";
import type { View } from "./types";

export const navItems: Array<{ id: View; label: string; icon: typeof Gauge }> = [
  { id: "setup", label: "Setup", icon: Wand2 },
  { id: "dashboard", label: "Projects", icon: Gauge },
  { id: "chat", label: "Agent Chat", icon: MessageSquareText },
  { id: "research", label: "Research", icon: Search },
  { id: "config", label: "Config", icon: Settings2 },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "sqlite", label: "SQLite", icon: Database },
  { id: "plugins", label: "Plugins", icon: Plug },
  { id: "workbench", label: "Workbench", icon: Workflow },
  { id: "docs", label: "Docs", icon: BookOpen }
];

export const defaultProject = "/home/alexmerced/development/personal/Personal/utility/2026/MagAgent";
export const minimumMagentVersion = "0.30.1";

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
