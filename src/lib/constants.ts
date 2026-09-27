export const defaultProject = "";
export const minimumMagentVersion = "1.4.0";

export const activeExecutionStates = new Set([
  "queued",
  "planning",
  "ready",
  "running",
  "waiting",
  "awaiting_human",
  "validating",
]);
export const terminalExecutionStates = new Set([
  "completed",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);

export const storageKeys = {
  theme: "mcc.theme",
  accent: "mcc.accent",
  project: "mcc.project",
  projects: "mcc.recentProjects",
  pinnedProjects: "mcc.pinnedProjects",
  chat: "mcc.chatHistory",
  chatSessions: "mcc.chatSessions",
  commands: "mcc.commandHistory",
  setupMethod: "mcc.setupMethod",
  setupDismissed: "mcc.setupDismissed",
  sqliteSavedQueries: "mcc.sqliteSavedQueries",
  projectCrews: "mcc.projectCrews",
  notifications: "mcc.notifications",
  editor: "mcc.editor",
};

export const quickPrompts = [
  "Summarize this project and suggest the next useful task.",
  "Review the current project for UX issues and propose fixes.",
  "Inspect memory for stale or duplicate facts and suggest cleanups.",
  "Run a docs audit and list the highest-impact documentation gaps.",
];

export const recipePrompts = [
  {
    name: "Release prep",
    command: ["recipe", "run", "release-prep", "--project"],
  },
  { name: "Docs audit", command: ["recipe", "run", "docs-audit", "--project"] },
  {
    name: "Test repair",
    command: ["recipe", "run", "test-repair", "--project"],
  },
];
