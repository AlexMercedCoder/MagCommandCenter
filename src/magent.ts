import { listen } from "@tauri-apps/api/event";
import {
  desktopAvailable,
  desktopInvoke,
  runtimeTransportKind,
} from "./lib/desktop";
import type {
  AgenticGraphDocument,
  AgentProfileSummary,
  ArtifactPreview,
  Checkpoint,
  EffectiveAgentProfile,
  ExecutionEvent,
  ExecutionTask,
  GraphAuthoringContract,
  OapDocument,
  ProfileCheckpoint,
  ProfileContract,
  ProfilePreview,
  ProjectInspection,
  ResolvedAgentProfile,
  SessionPeer,
} from "./lib/types";

export type MagentCommandResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  status: number | null;
};

export class MagentCommandError extends Error {
  constructor(
    message: string,
    readonly result: MagentCommandResult,
    readonly args: string[],
  ) {
    super(message);
    this.name = "MagentCommandError";
  }
}

export async function runMagent(args: string[]): Promise<MagentCommandResult> {
  if (runtimeTransportKind() === "native" && !desktopAvailable())
    return {
      ok: false,
      command: `magent ${args.join(" ")}`,
      stdout: "",
      stderr: "Desktop runtime unavailable in browser preview.",
      status: null,
    };
  return desktopInvoke<MagentCommandResult>("run_magent", { args });
}

export async function runMagentInput(
  args: string[],
  input: unknown,
): Promise<MagentCommandResult> {
  return desktopInvoke<MagentCommandResult>("run_magent_input", {
    args,
    input: JSON.stringify(input),
  });
}

export type MagentStreamEvent = {
  id: string;
  stream: "stdout" | "stderr";
  line: string;
};

export async function runMagentStream(
  args: string[],
  onEvent: (event: MagentStreamEvent) => void,
  options: { id?: string } = {},
): Promise<MagentCommandResult> {
  const id = options.id ?? crypto.randomUUID();
  if (runtimeTransportKind() === "remote") {
    const result = await desktopInvoke<MagentCommandResult>(
      "run_magent_stream",
      { id, args },
    );
    for (const line of result.stdout.split(/\r?\n/).filter(Boolean))
      onEvent({ id, stream: "stdout", line });
    for (const line of result.stderr.split(/\r?\n/).filter(Boolean))
      onEvent({ id, stream: "stderr", line });
    return result;
  }
  const unlisten = await listen<MagentStreamEvent>("magent-stream", (event) => {
    if (event.payload.id === id) onEvent(event.payload);
  });
  try {
    return await desktopInvoke<MagentCommandResult>("run_magent_stream", {
      id,
      args,
    });
  } finally {
    unlisten();
  }
}

export async function cancelMagentStream(id: string): Promise<boolean> {
  return desktopInvoke<boolean>("cancel_magent_stream", { id });
}

export async function runSetupCommand(
  program: string,
  args: string[],
): Promise<MagentCommandResult> {
  if (runtimeTransportKind() === "native" && !desktopAvailable())
    return {
      ok: false,
      command: `${program} ${args.join(" ")}`,
      stdout: "",
      stderr: "Desktop runtime unavailable in browser preview.",
      status: null,
    };
  return desktopInvoke<MagentCommandResult>("run_setup_command", {
    program,
    args,
  });
}

export async function inspectProject(path: string): Promise<ProjectInspection> {
  return desktopInvoke<ProjectInspection>("inspect_project", { path });
}

export async function readProjectArtifact(
  project: string,
  path: string,
): Promise<ArtifactPreview> {
  return desktopInvoke<ArtifactPreview>("read_project_artifact", {
    project,
    path,
  });
}

export async function saveDiagnosticsBundle(
  project: string,
  performanceData?: Record<string, unknown>,
): Promise<string> {
  const [system, diagnostics, tasks] = await Promise.all([
    runMagent(["system", "info"]),
    runMagent(["diagnostics", "--deep", "--project", project]),
    runMagent(["execution", "list", "--limit", "50"]),
  ]);
  return desktopInvoke<string>("save_diagnostics_bundle", {
    payload: {
      generated_at: new Date().toISOString(),
      project,
      user_agent: navigator.userAgent,
      performance: performanceData ?? {},
      system: parseJson(system) ?? { ok: system.ok, stderr: system.stderr },
      diagnostics: parseJson(diagnostics) ?? {
        ok: diagnostics.ok,
        stderr: diagnostics.stderr,
      },
      tasks: parseJson(tasks) ?? { ok: tasks.ok, stderr: tasks.stderr },
    },
  });
}

export function parseJson<T>(result: MagentCommandResult): T | null {
  const text = result.stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    const parsedLine = text
      .split(/\r?\n/)
      .reverse()
      .map((line) => line.trim())
      .find((line) => line.startsWith("{") && line.endsWith("}"));
    if (!parsedLine) return null;
    try {
      return JSON.parse(parsedLine) as T;
    } catch {
      return null;
    }
  }
}

function requireJson<T>(result: MagentCommandResult, args: string[]): T {
  const data = parseJson<T>(result);
  if (!result.ok || !data) {
    const message =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `magent ${args.join(" ")} failed`;
    throw new MagentCommandError(message, result, args);
  }
  return data;
}

export const magentClient = {
  async profileContract(project: string): Promise<ProfileContract> {
    const args = ["agent", "schema", "--project", project];
    return requireJson<ProfileContract>(await runMagent(args), args);
  },
  async providerModels(
    provider: string,
  ): Promise<Array<{ id?: string; name?: string; [key: string]: unknown }>> {
    const args = ["provider", "models", provider];
    const payload = requireJson<{
      models?: Array<
        string | { id?: string; name?: string; [key: string]: unknown }
      >;
    }>(await runMagent(args), args);
    return (payload.models ?? []).map((model) =>
      typeof model === "string" ? { id: model, name: model } : model,
    );
  },
  async profiles(project: string): Promise<AgentProfileSummary[]> {
    const args = ["agent", "list", "--project", project];
    return requireJson<{ profiles: AgentProfileSummary[] }>(
      await runMagent(args),
      args,
    ).profiles;
  },
  async profile(name: string, project: string): Promise<ResolvedAgentProfile> {
    const args = ["agent", "show", name, "--project", project];
    return requireJson<{ profile: ResolvedAgentProfile }>(
      await runMagent(args),
      args,
    ).profile;
  },
  async effectiveProfile(
    name: string,
    project: string,
  ): Promise<EffectiveAgentProfile | null> {
    const args = ["agent", "explain", name, "--project", project];
    return requireJson<{ effective_profile: EffectiveAgentProfile | null }>(
      await runMagent(args),
      args,
    ).effective_profile;
  },
  async profileDetail(
    name: string,
    project: string,
  ): Promise<{
    profile: ResolvedAgentProfile;
    effective_profile: EffectiveAgentProfile | null;
    checkpoints: ProfileCheckpoint[];
  }> {
    const args = ["agent", "detail", name, "--project", project];
    return requireJson<{
      profile: ResolvedAgentProfile;
      effective_profile: EffectiveAgentProfile | null;
      checkpoints: ProfileCheckpoint[];
    }>(await runMagent(args), args);
  },
  async defaultProfile(project: string): Promise<{
    profile: string;
    resolved: AgentProfileSummary | null;
    fallback: string;
  }> {
    const args = ["profile", "default", "--project", project];
    return requireJson<{
      profile: string;
      resolved: AgentProfileSummary | null;
      fallback: string;
    }>(await runMagent(args), args);
  },
  async setDefaultProfile(
    name: string,
    project: string,
    globalScope = false,
  ): Promise<Record<string, unknown>> {
    const args = ["profile", "set-default", name, "--project", project];
    if (globalScope) args.push("--global");
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async setGatewayProfile(name: string): Promise<Record<string, unknown>> {
    const args = ["config", "set", "gateway.agent_profile", name];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async previewProfile(
    document: OapDocument,
    project: string,
  ): Promise<ProfilePreview> {
    const args = ["agent", "preview", "--input", "-", "--project", project];
    return requireJson<ProfilePreview>(
      await runMagentInput(args, document),
      args,
    );
  },
  async generateProfileDraft(
    prompt: string,
    project: string,
    name = "",
    extendsProfile = "",
  ): Promise<
    ProfilePreview & {
      document: OapDocument;
      model?: string;
      prompt_digest?: string;
    }
  > {
    const args = ["agent", "generate-draft", prompt, "--project", project];
    if (name) args.push("--name", name);
    if (extendsProfile) args.push("--extends", extendsProfile);
    return requireJson<
      ProfilePreview & {
        document: OapDocument;
        model?: string;
        prompt_digest?: string;
      }
    >(await runMagent(args), args);
  },
  async applyProfile(
    document: OapDocument,
    scope: string,
    project: string,
    expectedDigest = "",
  ): Promise<Record<string, unknown>> {
    const args = [
      "agent",
      "apply",
      "--input",
      "-",
      "--scope",
      scope,
      "--project",
      project,
    ];
    if (expectedDigest) args.push("--expected-digest", expectedDigest);
    return requireJson<Record<string, unknown>>(
      await runMagentInput(args, document),
      args,
    );
  },
  async cloneProfile(
    source: string,
    name: string,
    scope: string,
    project: string,
  ): Promise<Record<string, unknown>> {
    const args = [
      "agent",
      "clone",
      source,
      name,
      "--scope",
      scope,
      "--project",
      project,
    ];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async deleteProfile(
    name: string,
    digest: string,
    project: string,
  ): Promise<Record<string, unknown>> {
    const args = [
      "agent",
      "delete",
      name,
      "--expected-digest",
      digest,
      "--project",
      project,
      "--yes",
    ];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async profileRevisions(
    name: string,
    project: string,
  ): Promise<ProfileCheckpoint[]> {
    const args = ["agent", "revisions", name, "--project", project];
    return requireJson<{ checkpoints: ProfileCheckpoint[] }>(
      await runMagent(args),
      args,
    ).checkpoints;
  },
  async restoreProfileRevision(
    name: string,
    checkpoint: string,
    digest: string,
    project: string,
  ): Promise<Record<string, unknown>> {
    const args = [
      "agent",
      "restore-revision",
      name,
      checkpoint,
      "--expected-digest",
      digest,
      "--project",
      project,
      "--yes",
    ];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async importProfile(
    source: string,
    scope: string,
    project: string,
    dryRun = false,
  ): Promise<Record<string, unknown>> {
    const args = [
      "agent",
      "import",
      source,
      "--scope",
      scope,
      "--project",
      project,
    ];
    if (dryRun) args.push("--dry-run");
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async exportProfile(
    name: string,
    output: string,
    project: string,
  ): Promise<Record<string, unknown>> {
    const args = [
      "agent",
      "export",
      name,
      "--output",
      output,
      "--project",
      project,
    ];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async profileInbox(project: string): Promise<Array<Record<string, unknown>>> {
    const args = ["agent", "inbox", "--project", project];
    return requireJson<{ deltas: Array<Record<string, unknown>> }>(
      await runMagent(args),
      args,
    ).deltas;
  },
  async decideProfileDelta(
    id: string,
    decision: "accept" | "reject",
    project: string,
  ): Promise<Record<string, unknown>> {
    const args = ["agent", decision, id, "--project", project];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async validateGraph(path: string): Promise<Record<string, unknown>> {
    const args = ["graph", "validate", path, "--strict", "--json"];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async planGraph(path: string): Promise<Record<string, unknown>> {
    const args = ["graph", "plan", path, "--json"];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async graphContract(project: string): Promise<GraphAuthoringContract> {
    const args = ["graph", "schema", "--project", project];
    return requireJson<GraphAuthoringContract>(await runMagent(args), args);
  },
  async inspectGraph(
    path: string,
  ): Promise<{ document: AgenticGraphDocument; digest: string; path: string }> {
    const args = ["graph", "inspect", path];
    return requireJson<{
      document: AgenticGraphDocument;
      digest: string;
      path: string;
    }>(await runMagent(args), args);
  },
  async previewGraph(
    document: AgenticGraphDocument,
    project: string,
  ): Promise<Record<string, unknown>> {
    const args = ["graph", "preview", "--input", "-", "--project", project];
    return requireJson<Record<string, unknown>>(
      await runMagentInput(args, document),
      args,
    );
  },
  async saveGraph(
    document: AgenticGraphDocument,
    path: string,
    project: string,
    expectedDigest = "",
  ): Promise<{ path: string; digest: string }> {
    const args = ["graph", "apply", path, "--input", "-", "--project", project];
    if (expectedDigest) args.push("--expected-digest", expectedDigest);
    return requireJson<{ path: string; digest: string }>(
      await runMagentInput(args, document),
      args,
    );
  },
  async generateGraph(
    goal: string,
    project: string,
  ): Promise<{
    document: AgenticGraphDocument;
    digest: string;
    fallback?: boolean;
    fallback_reason?: string;
  }> {
    const args = ["graph", "generate-draft", goal, "--project", project];
    return requireJson<{ document: AgenticGraphDocument; digest: string }>(
      await runMagent(args),
      args,
    );
  },
  async modelGraphDraft(
    goal: string,
    project: string,
    document?: AgenticGraphDocument,
    instruction = "",
  ): Promise<{
    document: AgenticGraphDocument;
    digest: string;
    changes: Array<Record<string, string>>;
    model: string;
    profile: string;
    fallback?: boolean;
    fallback_reason?: string;
    model_findings?: string[];
  }> {
    const args = ["graph", "model-draft", goal, "--project", project];
    if (instruction) args.push("--instruction", instruction);
    if (document) {
      args.push("--input", "-");
      return requireJson(await runMagentInput(args, document), args);
    }
    return requireJson(await runMagent(args), args);
  },
  async renameGraphNode(
    document: AgenticGraphDocument,
    oldId: string,
    newId: string,
  ): Promise<{ document: AgenticGraphDocument; digest: string }> {
    const args = ["graph", "rename-node", oldId, newId, "--input", "-"];
    return requireJson<{ document: AgenticGraphDocument; digest: string }>(
      await runMagentInput(args, document),
      args,
    );
  },
  async duplicateGraphNode(
    document: AgenticGraphDocument,
    nodeId: string,
    newId: string,
  ): Promise<{ document: AgenticGraphDocument; digest: string }> {
    const args = ["graph", "duplicate-node", nodeId, newId, "--input", "-"];
    return requireJson<{ document: AgenticGraphDocument; digest: string }>(
      await runMagentInput(args, document),
      args,
    );
  },
  async graphRun(runId: string): Promise<Record<string, unknown>> {
    const args = ["graph", "status", runId, "--json"];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async contracts(): Promise<Record<string, unknown>> {
    const args = ["system", "contracts"];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async createTask(
    title: string,
    project: string,
    sessionId: string,
  ): Promise<ExecutionTask> {
    const args = [
      "execution",
      "create",
      title,
      "--project",
      project,
      "--session",
      sessionId,
    ];
    const payload = requireJson<{ task: ExecutionTask }>(
      await runMagent(args),
      args,
    );
    return payload.task;
  },
  async createGraphTask(
    title: string,
    project: string,
  ): Promise<ExecutionTask> {
    const args = [
      "execution",
      "create",
      title,
      "--kind",
      "agentic_graph",
      "--project",
      project,
    ];
    return requireJson<{ task: ExecutionTask }>(await runMagent(args), args)
      .task;
  },
  async listTasks(limit = 100): Promise<ExecutionTask[]> {
    const args = ["execution", "list", "--limit", String(limit)];
    return requireJson<{ tasks: ExecutionTask[] }>(await runMagent(args), args)
      .tasks;
  },
  async childTasks(parentTaskId: string): Promise<ExecutionTask[]> {
    const args = [
      "execution",
      "list",
      "--parent",
      parentTaskId,
      "--limit",
      "1000",
    ];
    return requireJson<{ tasks: ExecutionTask[] }>(await runMagent(args), args)
      .tasks;
  },
  async task(taskId: string): Promise<ExecutionTask> {
    const args = ["execution", "show", taskId];
    return requireJson<{ task: ExecutionTask }>(await runMagent(args), args)
      .task;
  },
  async events(taskId: string, after = 0): Promise<ExecutionEvent[]> {
    const args = ["execution", "events", taskId, "--after", String(after)];
    return requireJson<{ events: ExecutionEvent[] }>(
      await runMagent(args),
      args,
    ).events;
  },
  async action(
    taskId: string,
    action: "pause" | "resume" | "cancel" | "retry",
  ): Promise<ExecutionTask> {
    const args = ["execution", action, taskId];
    return requireJson<{ task: ExecutionTask }>(await runMagent(args), args)
      .task;
  },
  async checkpoints(limit = 50): Promise<Checkpoint[]> {
    const args = ["checkpoint", "list", "--limit", String(limit), "--json"];
    return requireJson<{ checkpoints: Checkpoint[] }>(
      await runMagent(args),
      args,
    ).checkpoints;
  },
  async checkpointDiff(checkpointId: string): Promise<Record<string, unknown>> {
    const args = ["checkpoint", "diff", checkpointId, "--json"];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async restoreCheckpoint(
    checkpointId: string,
  ): Promise<Record<string, unknown>> {
    const args = ["checkpoint", "restore", checkpointId, "--yes"];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
  async sessionPeers(): Promise<SessionPeer[]> {
    const args = ["session", "peers", "--json"];
    return requireJson<{ sessions: SessionPeer[] }>(await runMagent(args), args)
      .sessions;
  },
  async sendSessionMessage(
    target: string,
    message: string,
  ): Promise<Record<string, unknown>> {
    const args = ["session", "send", target, message, "--json"];
    return requireJson<Record<string, unknown>>(await runMagent(args), args);
  },
};
