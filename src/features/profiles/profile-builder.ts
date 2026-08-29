import type { OapDocument, ProfileContract } from "../../lib/types";

export type ProfileDraft = {
  name: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  template: string;
  scope: string;
  extends: string[];
  instructions: string;
  persona: string;
  objectives: string;
  constraints: string;
  provider: string;
  model: string;
  toolPacks: string[];
  explicitTools: string[];
  permissionMode: string;
  network: string;
  skills: string[];
  mcpServers: string[];
  memoryMode: string;
  allowSubagents: boolean;
  subagents: string[];
  maxSubagents: number;
  maxParallel: number;
  maxDepth: number;
  maxTurns: number;
  maxStateTokens: number;
  contextFiles: string;
  onStart: string;
  onEnd: string;
  writeback: string;
  makeDefault: boolean;
};

export function emptyProfileDraft(
  contract?: ProfileContract | null,
): ProfileDraft {
  const provider = contract?.choices.providers[0];
  return {
    name: "",
    title: "",
    description: "",
    color: "#0f766e",
    icon: "sparkles",
    template: "general",
    scope: "user",
    extends: [],
    instructions: "",
    persona: "Clear, capable, and collaborative.",
    objectives:
      "Complete the requested outcome,Verify important work,Explain the result",
    constraints:
      "Respect active permissions,Do not claim work was completed without evidence",
    provider: provider?.id ?? "",
    model: provider?.default_model ?? "",
    toolPacks: ["files", "shell", "web"],
    explicitTools: [],
    permissionMode: "balanced",
    network: "read",
    skills: [],
    mcpServers: [],
    memoryMode: "read_write",
    allowSubagents: true,
    subagents: [],
    maxSubagents: 3,
    maxParallel: 2,
    maxDepth: 3,
    maxTurns: 16,
    maxStateTokens: 1200,
    contextFiles: "",
    onStart: "",
    onEnd: "",
    writeback: "propose",
    makeDefault: false,
  };
}

export function applyTemplate(
  draft: ProfileDraft,
  template: string,
): ProfileDraft {
  const presets: Record<string, Partial<ProfileDraft>> = {
    general: {
      toolPacks: ["files", "shell", "web", "data", "db", "desktop"],
      network: "read",
      memoryMode: "read_write",
    },
    coder: {
      toolPacks: ["files", "shell", "web"],
      network: "read",
      memoryMode: "read_write",
      persona: "Focused, pragmatic, and careful with project changes.",
    },
    researcher: {
      toolPacks: ["files", "web"],
      network: "read",
      memoryMode: "read",
      persona: "Curious, source-conscious, and concise.",
    },
    reviewer: {
      toolPacks: ["files"],
      network: "none",
      memoryMode: "read",
      allowSubagents: false,
      persona: "Independent, skeptical, and evidence-driven.",
    },
    custom: {
      toolPacks: [],
      network: "none",
      memoryMode: "off",
      allowSubagents: false,
    },
  };
  return { ...draft, template, ...(presets[template] ?? {}) };
}

export function buildProfileDocument(
  draft: ProfileDraft,
  contract: ProfileContract,
): OapDocument {
  const toolNames = Array.from(
    new Set([
      ...draft.explicitTools,
      ...draft.toolPacks.flatMap(
        (name) =>
          contract.choices.tool_packs.find((pack) => pack.name === name)
            ?.tools ?? [],
      ),
    ]),
  );
  const csv = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const contextFiles = csv(draft.contextFiles).map((path) => ({ path }));
  const annotations: Record<string, unknown> = {
    "dev.magcommandcenter.title": draft.title || draft.name,
    "dev.magcommandcenter.color": draft.color,
    "dev.magcommandcenter.icon": draft.icon,
  };
  const document: OapDocument = {
    oap: "1.0",
    metadata: {
      name: draft.name.trim().toLowerCase().replace(/\s+/g, "-"),
      description:
        draft.description.trim() ||
        `${draft.title || draft.name} agent profile`,
      revision: 1,
      annotations,
    },
    spec: {
      role: {
        instructions:
          draft.instructions.trim() ||
          `Act as ${draft.title || draft.name} and complete work within the declared capabilities.`,
        persona: draft.persona.trim(),
        objectives: csv(draft.objectives),
        constraints: csv(draft.constraints),
      },
      tools: {
        allow: toolNames,
        skills: draft.skills,
        mcp_servers: draft.mcpServers,
      },
      permissions: { default: draft.permissionMode, network: draft.network },
      runtime: {
        mode: "primary",
        max_turns: draft.maxTurns,
        subagents: draft.allowSubagents
          ? {
              allow: draft.subagents,
              max_subagents: draft.maxSubagents,
              max_parallel: draft.maxParallel,
              max_depth: draft.maxDepth,
            }
          : { allow: [], max_subagents: 0, max_parallel: 0, max_depth: 0 },
      },
      memory: { mode: draft.memoryMode },
      context: {
        ...(contextFiles.length ? { files: contextFiles } : {}),
        budget: { max_state_tokens: draft.maxStateTokens },
      },
    },
    state: [],
    history: [],
    proposals: [],
    lifecycle: {
      writeback: draft.writeback,
      ...(draft.onStart.trim() ? { on_start: draft.onStart.trim() } : {}),
      ...(draft.onEnd.trim() ? { on_end: draft.onEnd.trim() } : {}),
    },
  };
  if (draft.extends.length === 1) document.extends = draft.extends[0];
  if (draft.extends.length > 1) document.extends = draft.extends;
  if (!draft.provider) delete document.spec.model;
  else document.spec.model = { provider: draft.provider, id: draft.model };
  return document;
}

export function draftFromDocument(
  profile: OapDocument,
  scope = "user",
): ProfileDraft {
  const annotations = profile.metadata.annotations ?? {};
  const role = profile.spec.role ?? {};
  const permissions = profile.spec.permissions ?? {};
  const model = profile.spec.model ?? {};
  const tools = profile.spec.tools ?? {};
  const runtime = profile.spec.runtime ?? {};
  const subagents =
    typeof runtime.subagents === "object" && runtime.subagents
      ? (runtime.subagents as Record<string, unknown>)
      : {};
  const context = profile.spec.context ?? {};
  const lifecycle = profile.lifecycle ?? {};
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  const strings = (value: unknown) => list(value).map(String);
  const refs = (value: unknown) =>
    list(value)
      .map((item) =>
        typeof item === "object" && item !== null
          ? String(
              (item as Record<string, unknown>).name ??
                (item as Record<string, unknown>).id ??
                "",
            )
          : String(item),
      )
      .filter(Boolean);
  return {
    ...emptyProfileDraft(),
    name: profile.metadata.name,
    title: String(
      annotations["dev.magcommandcenter.title"] ?? profile.metadata.name,
    ),
    description: profile.metadata.description ?? "",
    color: String(annotations["dev.magcommandcenter.color"] ?? "#0f766e"),
    icon: String(annotations["dev.magcommandcenter.icon"] ?? "sparkles"),
    scope,
    extends:
      typeof profile.extends === "string"
        ? [profile.extends]
        : (profile.extends ?? []),
    instructions: String(role.instructions ?? ""),
    persona: String(role.persona ?? ""),
    objectives: strings(role.objectives).join(","),
    constraints: strings(role.constraints).join(","),
    provider: String(model.provider ?? ""),
    model: String(model.id ?? ""),
    toolPacks: [],
    explicitTools: strings(tools.allow),
    permissionMode: String(permissions.default ?? "balanced"),
    network: String(permissions.network ?? "full"),
    skills: refs(tools.skills),
    mcpServers: refs(tools.mcp_servers),
    memoryMode: String((profile.spec.memory ?? {}).mode ?? "read_write"),
    allowSubagents:
      Number(subagents.max_subagents ?? 0) > 0 ||
      refs(subagents.allow).length > 0,
    subagents: refs(subagents.allow ?? subagents.profiles),
    maxSubagents: Number(subagents.max_subagents ?? 3),
    maxParallel: Number(subagents.max_parallel ?? 2),
    maxDepth: Number(subagents.max_depth ?? 3),
    maxTurns: Number(runtime.max_turns ?? 16),
    maxStateTokens: Number(
      (context.budget as Record<string, unknown> | undefined)
        ?.max_state_tokens ?? 1200,
    ),
    contextFiles: list(context.files)
      .map((item) =>
        typeof item === "object" && item !== null
          ? String((item as Record<string, unknown>).path ?? "")
          : String(item),
      )
      .filter(Boolean)
      .join(","),
    onStart: String(lifecycle.on_start ?? ""),
    onEnd: String(lifecycle.on_end ?? ""),
    writeback: String(lifecycle.writeback ?? "propose"),
  };
}
