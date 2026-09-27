import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { jsonSource } from "../graph-model";
import type {
  AgenticGraphDocument,
  AgentProfileSummary,
  GraphNodeType,
} from "../../../lib/types";
import { loadAppState, saveAppState } from "../../../lib/persistence";

export type GraphBoardProps = {
  project: string;
  profiles: AgentProfileSummary[];
  notify: (text: string, tone?: "info" | "good" | "bad") => void;
  onDirtyChange?: (dirty: boolean) => void;
};
export type ViewMode = "board" | "map" | "source";
export type WorkspacePanel = "assistant" | "templates" | "review" | "execution";
export type Proposal = {
  document: AgenticGraphDocument;
  changes: Array<Record<string, string>>;
  model: string;
  profile: string;
};
export type DraftRecord = {
  document: AgenticGraphDocument;
  path: string;
  digest: string;
  baseline: AgenticGraphDocument | null;
  updatedAt: string;
};
export const nodeTypes: GraphNodeType[] = [
  "task",
  "decision",
  "gate",
  "loop",
  "map",
  "subgraph",
];
export const activeStates = new Set([
  "queued",
  "planning",
  "running",
  "waiting",
  "awaiting_human",
  "validating",
  "ready",
]);

export function schemaEnum(
  schema: Record<string, unknown> | undefined,
  def: string,
  property: string,
  fallback: string[],
): string[] {
  const defs = schema?.["$defs"] as
    Record<string, Record<string, unknown>> | undefined;
  const properties = defs?.[def]?.properties as
    Record<string, Record<string, unknown>> | undefined;
  const values = properties?.[property]?.enum;
  return Array.isArray(values) ? values.map(String) : fallback;
}
export function csv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
export function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
export function toggleSet<T>(set: Set<T>, value: T) {
  const next = new Set(set);
  next.has(value) ? next.delete(value) : next.add(value);
  return next;
}
export function localDigest(document: AgenticGraphDocument) {
  return JSON.stringify(document);
}
export function serializeSource(document: AgenticGraphDocument, path: string) {
  return path.toLowerCase().endsWith(".json")
    ? jsonSource(document)
    : stringifyYaml(document, { lineWidth: 100 });
}
export function parseSource(text: string, path: string) {
  const value = path.toLowerCase().endsWith(".json")
    ? JSON.parse(text)
    : parseYaml(text);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Graph source must contain an object");
  return value as AgenticGraphDocument;
}
export function ordered(ids: string[], order: string[]) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...ids].sort(
    (a, b) =>
      (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}
export function draftKey(project: string) {
  return `mcc.graphDraft:${project}`;
}
export function recentKey(project: string) {
  return `mcc.recentGraphs:${project}`;
}
export function pinnedKey(project: string) {
  return `mcc.pinnedGraphs:${project}`;
}
export async function restoreDraft(project: string) {
  return loadAppState<DraftRecord | null>(draftKey(project), null);
}
export async function rememberGraph(project: string, path: string) {
  const key = recentKey(project);
  const current = await loadAppState<string[]>(key, []);
  await saveAppState(
    key,
    [path, ...current.filter((item) => item !== path)].slice(0, 25),
  );
}
