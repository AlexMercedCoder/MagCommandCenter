export type Theme = "light" | "dark";
export type View = "setup" | "dashboard" | "chat" | "research" | "config" | "memory" | "sqlite" | "plugins" | "workbench" | "docs";
export type SetupMethod = "pipx-install" | "pipx-upgrade" | "pip-user";

export type SystemInfo = {
  magent_version?: string;
  current_user?: string;
  paths?: Record<string, string>;
};

export type Readiness = {
  ok?: boolean;
  provider?: string;
  model?: string;
  checks?: Array<{ key: string; ok: boolean; detail?: string }>;
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
};

export type RunToolEvent = {
  name: string;
  status: "running" | "ok" | "failed" | "blocked" | "unknown";
  detail: string;
  durationMs?: number;
  path?: string;
};

export type RunArtifact = {
  path: string;
  kind: "file" | "document" | "image" | "diagram" | "unknown";
  detail: string;
};

export type RunPermission = {
  command: string;
  status: "requested" | "approved" | "denied" | "blocked";
  detail: string;
};

export type RunCockpit = {
  started: boolean;
  completed: boolean;
  ok: boolean | null;
  modelRounds: number;
  toolCount: number;
  failedToolCount: number;
  totalDurationMs?: number;
  slowestTool?: RunToolEvent;
  tools: RunToolEvent[];
  permissions: RunPermission[];
  artifacts: RunArtifact[];
  headline: string;
};

export type ProjectInspection = {
  path: string;
  exists: boolean;
  git_status?: string | null;
  package_manager?: string | null;
  frameworks: string[];
  languages: string[];
  test_commands: string[];
  dirty_files: number;
  recommended_next_action: string;
};

export type ConfigField = {
  path: string;
  label: string;
  type: string;
  category?: string;
  choices?: string[];
  value?: unknown;
  description?: string;
};

export type MemoryNode = {
  id?: string;
  title?: string;
  type?: string;
  path?: string;
  body?: string;
  links?: string[];
  backlinks?: string[];
  [key: string]: unknown;
};

export type SqliteDatabase = {
  key?: string;
  name?: string;
  path?: string;
  label?: string;
  [key: string]: unknown;
};

export type TableData = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

export type Toast = {
  id: string;
  tone: "good" | "bad" | "info";
  text: string;
};
