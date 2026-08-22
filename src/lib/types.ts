export type Theme = "light" | "dark";
export type View = "setup" | "dashboard" | "chat" | "runs" | "library" | "agents" | "graphs" | "research" | "config" | "memory" | "sqlite" | "plugins" | "workbench" | "docs";
export type SetupMethod = "pipx-install" | "pipx-upgrade" | "pip-user";

export type SystemInfo = {
  magent_version?: string;
  current_user?: string;
  paths?: Record<string, string>;
  contract_schema?: string;
  contracts?: Record<string, { version?: string; status?: string; [key: string]: unknown }>;
};

export type ToolReadiness = {
  ok?: boolean;
  core_ready?: boolean;
  capabilities?: Array<{ capability: string; available: boolean; missing_modules?: string[]; install?: string }>;
  full_install?: string;
};

export type ProviderDetection = {
  ok?: boolean;
  providers?: Array<{
    id: string;
    label: string;
    default_model: string;
    env_present: boolean;
    env_present_name?: string;
    local: boolean;
  }>;
};

export type CacheReadiness = {
  provider?: string;
  model?: string;
  enabled?: boolean;
  stable_prefix_tokens?: number;
  min_stable_prefix_tokens?: number;
  recommendations?: string[];
};

export type Readiness = {
  ok?: boolean;
  provider?: string;
  model?: string;
  checks?: Array<{ key: string; ok: boolean; detail?: string }>;
};

export type EcosystemReadiness = {
  schema?: string;
  ok?: boolean;
  checks?: Array<{ name: string; ok: boolean; status: string; detail: string }>;
  external_gates?: string[];
  components?: Record<string, Record<string, unknown>>;
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
  agentProfile?: string;
  profileDigest?: string;
};

export type AgentProfileSummary = {
  name: string;
  revision: number;
  source: string;
  trust: string;
  encoding: string;
  legacy: boolean;
  spec_digest: string;
  profile_digest: string;
  resolution_digest: string;
  warnings: string[];
  extends: string[];
  description?: string;
};

export type GraphNodeType = "task" | "decision" | "gate" | "loop" | "map" | "subgraph";

export type AgenticGraphNode = {
  type?: GraphNodeType;
  title: string;
  description: string;
  depends_on?: string[];
  labels?: string[];
  intelligence?: { tier?: string; [key: string]: unknown };
  requirements?: { tools?: string[]; permissions?: string[]; workspace?: string; [key: string]: unknown };
  constraints?: Record<string, unknown>;
  inputs?: Record<string, Record<string, unknown>>;
  outputs?: Record<string, Record<string, unknown>>;
  success?: Record<string, unknown>;
  failure?: Record<string, unknown>;
  when?: string;
  decision?: Record<string, unknown>;
  gate?: Record<string, unknown>;
  loop?: Record<string, unknown>;
  map?: Record<string, unknown>;
  subgraph?: Record<string, unknown>;
  estimate?: { effort?: string; cost_usd?: number; wall_clock_seconds?: number; [key: string]: unknown };
  "x-magagent-profile"?: string;
  [key: string]: unknown;
};

export type AgenticGraphDocument = {
  ags_version: string;
  kind: "AgenticGraph";
  id: string;
  title: string;
  objective: string;
  entrypoints: string[];
  nodes: Record<string, AgenticGraphNode>;
  edges?: Array<{ from: string; to: string; kind?: "sequence" | "conditional" | "on_failure"; when?: string; label?: string }>;
  [key: string]: unknown;
};

export type GraphAuthoringContract = {
  ok: boolean;
  contract: string;
  graph_spec: string;
  profile_extension: string;
  node_types: string[];
  node_templates: Record<GraphNodeType, AgenticGraphNode>;
  graph_templates: Array<{ id: string; title: string; description: string; source: string; plugin: string; trust: string; digest: string; document: AgenticGraphDocument }>;
  profiles: AgentProfileSummary[];
  warnings: string[];
  schema: Record<string, unknown>;
};

export type OapDocument = {
  oap: "1.0";
  extends?: string | string[];
  metadata: {
    name: string;
    description?: string;
    revision: number;
    annotations?: Record<string, unknown>;
  };
  spec: {
    role: Record<string, unknown> & { instructions?: string };
    model?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    permissions?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
    memory?: Record<string, unknown>;
    context?: Record<string, unknown>;
    lifecycle?: Record<string, unknown>;
  };
  state?: unknown[] | Record<string, unknown>;
  history?: unknown[];
  proposals?: unknown[];
  lifecycle?: Record<string, unknown>;
};

export type ResolvedAgentProfile = AgentProfileSummary & { document: OapDocument };

export type EffectiveAgentProfile = AgentProfileSummary & {
  tools: string[];
  permission_mode: string;
  network_access: string;
  provider: string;
  model: string;
  max_turns: number;
  max_state_tokens: number;
  writeback: string;
  mcp_servers: string[] | null;
  skills: string[] | null;
  subagents: string[] | null;
  max_subagents: number;
  max_parallel_subagents: number;
  max_delegation_depth: number;
  memory_stores: Array<{ name: string; kind: string; mode: string }>;
  adjustments: Array<{ field: string; requested: unknown; effective: unknown; reason: string }>;
};

export type ProfileContract = {
  ok: boolean;
  contract: "magent.oap-profile.v1" | string;
  schema: Record<string, unknown>;
  choices: {
    scopes: string[];
    permission_modes: string[];
    network_modes: string[];
    memory_modes: string[];
    writeback_modes: string[];
    tools: Array<{ name: string; description: string }>;
    tool_packs: Array<{ name: string; description: string; tools: string[]; enabled: boolean }>;
    skills: Array<{ name: string; description: string; version?: string; path?: string }>;
    mcp_servers: string[];
    profiles: AgentProfileSummary[];
    providers: Array<{ id: string; label: string; default_model: string; access_mode: string }>;
  };
  templates: Array<{ id: string; title: string; description: string; tools: string[]; network: string }>;
  guidance: { profile_boundary: string; network: Record<string, string>; effective_policy: string };
  warnings: string[];
};

export type ProfilePreview = {
  ok: boolean;
  ready: boolean;
  contract: string;
  profile: ResolvedAgentProfile;
  effective_profile?: EffectiveAgentProfile;
  dependencies: {
    ok: boolean;
    requested: Record<string, string[]>;
    missing: Record<string, string[]>;
  };
  warnings: string[];
  error?: string;
};

export type ProjectCrew = {
  project: string;
  coordinator: string;
  members: Array<{ profile: string; role: string }>;
};

export type ProfileCheckpoint = {
  path: string;
  revision: number;
  profile_digest: string;
  modified_at: number;
};

export type ExecutionState =
  | "pending"
  | "queued"
  | "planning"
  | "running"
  | "waiting"
  | "blocked"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled"
  | "ready"
  | "awaiting_human"
  | "succeeded"
  | "skipped";

export type ExecutionTask = {
  id: string;
  schema_version: "magent.task.v2" | "magent.task.v1" | string;
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
