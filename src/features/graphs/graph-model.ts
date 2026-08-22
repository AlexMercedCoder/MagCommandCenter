import type { AgenticGraphDocument, AgenticGraphNode, GraphNodeType } from "../../lib/types";

export type GraphStage = { level: number; nodeIds: string[] };
export type GraphDiagnostic = { code: string; severity: "error" | "warning"; message: string; nodeId?: string };

export function graphStages(document: AgenticGraphDocument): { stages: GraphStage[]; cycle: boolean } {
  const ids = Object.keys(document.nodes);
  const incoming = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const [id, node] of Object.entries(document.nodes)) {
    for (const parent of node.depends_on ?? []) {
      if (!incoming.has(parent)) continue;
      incoming.set(id, (incoming.get(id) ?? 0) + 1);
      outgoing.get(parent)?.push(id);
    }
  }
  const ready = ids.filter((id) => incoming.get(id) === 0);
  const levels = new Map<string, number>();
  let seen = 0;
  while (ready.length) {
    const id = ready.shift()!;
    seen += 1;
    const level = Math.max(0, ...(document.nodes[id].depends_on ?? []).map((parent) => (levels.get(parent) ?? -1) + 1));
    levels.set(id, level);
    for (const child of outgoing.get(id) ?? []) {
      incoming.set(child, (incoming.get(child) ?? 1) - 1);
      if (incoming.get(child) === 0) ready.push(child);
    }
  }
  const grouped = new Map<number, string[]>();
  for (const id of ids) {
    const level = levels.get(id) ?? 0;
    grouped.set(level, [...(grouped.get(level) ?? []), id]);
  }
  return { stages: [...grouped].sort(([a], [b]) => a - b).map(([level, nodeIds]) => ({ level, nodeIds })), cycle: seen !== ids.length };
}

export function fallbackNodeTemplate(type: GraphNodeType, index = 1): AgenticGraphNode {
  const base: AgenticGraphNode = { type, title: `New ${type} ${index}`, description: `Configure the ${type} outcome and review it before execution.` };
  if (type === "task") return { ...base, intelligence: { tier: "standard" }, requirements: { tools: ["file_read"], permissions: ["fs:read:**"], workspace: "read_only" }, constraints: { max_agent_steps: 16, max_wall_clock_seconds: 900 }, failure: { retry: { max_attempts: 2, retry_on: ["transient", "criteria_failed"] }, on_exhausted: "fail" }, estimate: { effort: "s", cost_usd: 0.2 } };
  if (type === "decision") return { ...base, intelligence: { tier: "standard" }, decision: { question: "Which reviewed path should run?", branches: [{ label: "continue", description: "Continue with the default path." }] } };
  if (type === "gate") return { ...base, gate: { mode: "approve", prompt: "Approve this graph checkpoint?", on_reject: "fail" } };
  const body = { entrypoints: ["work"], nodes: { work: fallbackNodeTemplate("task") } };
  if (type === "loop") return { ...base, loop: { mode: "repeat", max_iterations: 1, body } };
  if (type === "map") return { ...base, map: { over: "[]", as: "item", max_items: 10, max_parallel: 1, body } };
  return { ...base, subgraph: { inline: body, inherit_context: false } };
}

export function localDraftFromGoal(goal: string): AgenticGraphDocument {
  const objective = goal.trim();
  const nodes: AgenticGraphDocument["nodes"] = {
    inspect: { ...fallbackNodeTemplate("task"), title: "Inspect context", description: `Understand the project and constraints for: ${objective}`, labels: ["discovery"] },
    plan: { ...fallbackNodeTemplate("task"), title: "Plan the change", description: "Turn the findings into a reviewable implementation plan.", depends_on: ["inspect"], labels: ["planning"] },
    implement: { ...fallbackNodeTemplate("task"), title: "Implement", description: "Apply the approved changes with bounded authority.", depends_on: ["plan"], requirements: { tools: ["file_read", "file_edit", "shell_exec"], permissions: ["fs:read:**", "fs:write:project"], workspace: "read_write" }, labels: ["delivery"] },
    verify: { ...fallbackNodeTemplate("task"), title: "Verify", description: "Run focused tests and collect evidence for the result.", depends_on: ["implement"], labels: ["quality"] },
    review: { ...fallbackNodeTemplate("gate"), title: "Review evidence", description: "Review the change and its validation evidence before completion.", depends_on: ["verify"], labels: ["approval"] }
  };
  return { ags_version: "1.0", kind: "AgenticGraph", id: "local/review-draft", title: objective.length > 56 ? `${objective.slice(0, 53)}…` : objective, objective, entrypoints: ["inspect"], nodes };
}

export function nextNodeId(document: AgenticGraphDocument, type: GraphNodeType): string {
  let index = Object.keys(document.nodes).length + 1;
  while (document.nodes[`${type}_${index}`]) index += 1;
  return `${type}_${index}`;
}

export function addNode(document: AgenticGraphDocument, type: GraphNodeType = "task", template?: AgenticGraphNode): AgenticGraphDocument {
  const id = nextNodeId(document, type);
  const node = structuredClone(template ?? fallbackNodeTemplate(type, Object.keys(document.nodes).length + 1));
  node.title = node.title.replace(/\d+$/, String(Object.keys(document.nodes).length + 1));
  return { ...document, nodes: { ...document.nodes, [id]: node }, entrypoints: document.entrypoints.length ? document.entrypoints : [id] };
}

export function replaceNodeType(document: AgenticGraphDocument, id: string, type: GraphNodeType, template?: AgenticGraphNode): AgenticGraphDocument {
  const current = document.nodes[id];
  const next = structuredClone(template ?? fallbackNodeTemplate(type));
  next.title = current.title;
  next.description = current.description;
  next.depends_on = current.depends_on;
  next.labels = current.labels;
  next["x-magagent-profile"] = current["x-magagent-profile"];
  return updateNode(document, id, next, true);
}

export function updateNode(document: AgenticGraphDocument, id: string, patch: Partial<AgenticGraphNode>, replace = false): AgenticGraphDocument {
  return { ...document, nodes: { ...document.nodes, [id]: replace ? patch as AgenticGraphNode : { ...document.nodes[id], ...patch } } };
}

export function removeNode(document: AgenticGraphDocument, id: string): AgenticGraphDocument {
  const nodes = Object.fromEntries(Object.entries(document.nodes).filter(([nodeId]) => nodeId !== id).map(([nodeId, node]) => [nodeId, { ...node, depends_on: (node.depends_on ?? []).filter((parent) => parent !== id) }]));
  const edges = document.edges?.filter((edge) => edge.from !== id && edge.to !== id);
  return { ...document, nodes, edges, entrypoints: document.entrypoints.filter((entry) => entry !== id) };
}

export function duplicateNodeLocal(document: AgenticGraphDocument, id: string): { document: AgenticGraphDocument; id: string } {
  let suffix = 2;
  let next = `${id}_copy`;
  while (document.nodes[next]) next = `${id}_copy_${suffix++}`;
  const copy = structuredClone(document.nodes[id]);
  copy.title = `${copy.title} copy`;
  return { document: { ...document, nodes: { ...document.nodes, [next]: copy } }, id: next };
}

export function graphDiagnostics(document: AgenticGraphDocument): GraphDiagnostic[] {
  const result: GraphDiagnostic[] = [];
  const ids = new Set(Object.keys(document.nodes));
  const serialized = JSON.stringify(document);
  const dependents = new Map([...ids].map((id) => [id, [] as string[]]));
  const { cycle } = graphStages(document);
  if (cycle) result.push({ code: "cycle", severity: "error", message: "Dependency cycle detected." });
  for (const [id, node] of Object.entries(document.nodes)) {
    for (const parent of node.depends_on ?? []) {
      if (!ids.has(parent)) result.push({ code: "unknown_dependency", severity: "error", nodeId: id, message: `${id} depends on missing node ${parent}.` });
      else dependents.get(parent)?.push(id);
    }
    for (const output of Object.keys(node.outputs ?? {})) {
      const reference = `nodes.${id}.outputs.${output}`;
      if (!serialized.includes(reference)) result.push({ code: "disconnected_output", severity: "warning", nodeId: id, message: `${id}.${output} is declared but not consumed or exported.` });
    }
  }
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id) || !ids.has(id)) return;
    reachable.add(id);
    for (const child of dependents.get(id) ?? []) visit(child);
    for (const edge of document.edges ?? []) if (edge.from === id) visit(edge.to);
  };
  document.entrypoints.forEach(visit);
  for (const id of ids) if (!reachable.has(id)) result.push({ code: "unreachable", severity: "warning", nodeId: id, message: `${id} is unreachable from the graph entrypoints.` });
  return result;
}

export function outgoingDependents(document: AgenticGraphDocument, id: string): string[] {
  return Object.entries(document.nodes).filter(([, node]) => (node.depends_on ?? []).includes(id)).map(([child]) => child);
}

export function filterNodeIds(document: AgenticGraphDocument, query: string, type: string, profile: string, label: string): Set<string> {
  const needle = query.trim().toLowerCase();
  return new Set(Object.entries(document.nodes).filter(([, node]) => {
    if (type && (node.type ?? "task") !== type) return false;
    if (profile && (node["x-magagent-profile"] ?? "") !== profile) return false;
    if (label && !(node.labels ?? []).includes(label)) return false;
    return !needle || `${node.title} ${node.description}`.toLowerCase().includes(needle);
  }).map(([id]) => id));
}

export function jsonSource(document: AgenticGraphDocument): string { return JSON.stringify(document, null, 2); }

export function sourceDiff(before: AgenticGraphDocument | null, after: AgenticGraphDocument): string[] {
  const a = before ? jsonSource(before).split("\n") : [];
  const b = jsonSource(after).split("\n");
  const lines: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) lines.push(`- ${a[i]}`);
    if (b[i] !== undefined) lines.push(`+ ${b[i]}`);
  }
  return lines;
}

export function measureGraphModel(document: AgenticGraphDocument): number {
  const started = performance.now();
  graphStages(document);
  graphDiagnostics(document);
  return performance.now() - started;
}
