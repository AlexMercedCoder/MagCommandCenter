export type Theme = "light" | "dark";
export type View = "setup" | "dashboard" | "chat" | "research" | "config" | "memory" | "sqlite" | "plugins" | "workbench" | "docs";
export type SetupMethod = "pipx-install" | "pipx-upgrade" | "pip-user";

export type SystemInfo = {
  magent_version?: string;
  current_user?: string;
  paths?: Record<string, string>;
  contract_schema?: string;
  contracts?: Record<string, { version?: string; status?: string; [key: string]: unknown }>;
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

export type ExecutionState =
  | "queued"
  | "planning"
  | "running"
  | "waiting"
  | "blocked"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled";

export type ExecutionTask = {
  id: string;
  schema_version: "magent.task.v1" | string;
  kind: string;
  title: string;
  state: ExecutionState;
  project_id: string;
  project_path: string;
  session_id: string;
  parent_task_id: string;
  created_at: string;
  updated_at: string;
  started_at: string;
  finished_at: string;
  attempt: number;
  usage: Record<string, unknown>;
  files_changed: string[];
  checkpoints: string[];
  final_audit: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type ExecutionEvent = {
  schema_version: "magent.task-event.v1" | string;
  task_id: string;
  sequence: number;
  type: string;
  state: ExecutionState;
  created_at: string;
  detail: Record<string, unknown>;
};

export type ArtifactPreview = {
  path: string;
  kind: "image" | "svg" | "html" | "markdown" | "code" | "text" | "binary";
  mime_type: string;
  text: string | null;
  data_url: string | null;
  bytes: number;
  truncated: boolean;
};

export type Checkpoint = {
  id: string;
  operation?: string;
  status?: string;
  path?: string;
  created_at?: string;
  session_id?: string;
};

export type SessionPeer = {
  session_id?: string;
  id?: string;
  name?: string;
  project?: string;
  cwd?: string;
  state?: string;
  updated_at?: string;
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
