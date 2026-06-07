import type { ConfigField, MemoryNode, SqliteDatabase, TableData } from "./types";

export function readStoredString(key: string, fallback: string) {
  return localStorage.getItem(key) ?? fallback;
}

export function readStoredJson<T>(key: string, fallback: T): T {
  const value = localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function pretty(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function compareVersions(a = "0.0.0", b = "0.0.0") {
  const left = a.split(".").map((item) => Number.parseInt(item, 10) || 0);
  const right = b.split(".").map((item) => Number.parseInt(item, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function summarizeChatResponse(value: Record<string, unknown> | null) {
  if (!value) return "";
  const candidate = value.response ?? value.answer ?? value.output ?? value.message ?? value.summary;
  return typeof candidate === "string" ? candidate : pretty(value);
}

export function extractNodes(graph: Record<string, unknown> | null): MemoryNode[] {
  if (!graph) return [];
  const candidates = [graph.nodes, graph.results, graph.items, graph.memories];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as MemoryNode[];
  }
  return [];
}

export function extractDatabases(data: Record<string, unknown> | null): SqliteDatabase[] {
  if (!data) return [];
  const candidates = [data.databases, data.items, data.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as SqliteDatabase[];
  }
  return [];
}

export function extractRows(data: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!data) return [];
  const candidates = [data.rows, data.tables, data.databases, data.plugins, data.items, data.results, data.sources];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
    }
  }
  return [];
}

export function tableFromRows(rows: Array<Record<string, unknown>>): TableData {
  return { columns: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 12), rows };
}

export function extractTable(data: Record<string, unknown> | null): TableData {
  const rows = extractRows(data);
  const declaredColumns = data?.columns;
  const columns =
    Array.isArray(declaredColumns) && declaredColumns.every((column) => typeof column === "string")
      ? declaredColumns
      : Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 12);
  return { columns, rows };
}

export function databaseValue(db?: SqliteDatabase) {
  if (!db) return "";
  return String(db.key ?? db.name ?? db.path ?? db.label ?? "");
}

export function stringifyConfigValue(value: unknown) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "";
  return String(value);
}

export function encodeFieldValue(field: ConfigField, value: string) {
  if (field.type === "boolean") return value === "true" ? "true" : "false";
  if (field.type === "number") return value;
  return value;
}

export function getNodeBody(node: Record<string, unknown> | null) {
  if (!node) return "";
  const candidate = node.body ?? node.content ?? node.markdown;
  return typeof candidate === "string" ? candidate : JSON.stringify(node, null, 2);
}

export function listFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function parseVersion(value: string) {
  const match = value.match(/(\d+\.\d+\.\d+)/);
  return match?.[1];
}
