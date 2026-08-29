import type {
  ConfigField,
  MemoryNode,
  RunArtifact,
  RunCockpit,
  RunPermission,
  RunToolEvent,
  SqliteDatabase,
  TableData,
} from "./types";

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
  const candidate =
    value.response ??
    value.answer ??
    value.output ??
    value.message ??
    value.summary;
  return typeof candidate === "string" ? candidate : pretty(value);
}

export function extractNodes(
  graph: Record<string, unknown> | null,
): MemoryNode[] {
  if (!graph) return [];
  const candidates = [graph.nodes, graph.results, graph.items, graph.memories];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as MemoryNode[];
  }
  return [];
}

export function extractDatabases(
  data: Record<string, unknown> | null,
): SqliteDatabase[] {
  if (!data) return [];
  const candidates = [data.databases, data.items, data.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as SqliteDatabase[];
  }
  return [];
}

export function extractRows(
  data: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  if (!data) return [];
  const candidates = [
    data.rows,
    data.tables,
    data.databases,
    data.plugins,
    data.items,
    data.results,
    data.sources,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null,
      );
    }
  }
  return [];
}

export function tableFromRows(rows: Array<Record<string, unknown>>): TableData {
  return {
    columns: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(
      0,
      12,
    ),
    rows,
  };
}

export function extractTable(data: Record<string, unknown> | null): TableData {
  const rows = extractRows(data);
  const declaredColumns = data?.columns;
  const columns =
    Array.isArray(declaredColumns) &&
    declaredColumns.every((column) => typeof column === "string")
      ? declaredColumns
      : Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(
          0,
          12,
        );
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
  return typeof candidate === "string"
    ? candidate
    : JSON.stringify(node, null, 2);
}

export function listFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function parseVersion(value: string) {
  const match = value.match(/(\d+\.\d+\.\d+)/);
  return match?.[1];
}

export function deriveRunCockpit(
  events: Array<Record<string, unknown>>,
  response: Record<string, unknown> | null,
  streamLines: string[],
): RunCockpit {
  const tools = mergeTools([
    ...toolsFromEvents(events),
    ...toolsFromStream(streamLines),
  ]);
  const permissions = mergePermissions([
    ...permissionsFromEvents(events),
    ...permissionsFromStream(streamLines),
  ]);
  const artifacts = mergeArtifacts([
    ...artifactsFromEvents(events),
    ...artifactsFromResponse(response),
    ...artifactsFromStream(streamLines),
  ]);
  const failedToolCount = tools.filter(
    (tool) => tool.status === "failed" || tool.status === "blocked",
  ).length;
  const explicitOk = typeof response?.ok === "boolean" ? response.ok : null;
  const completed =
    Boolean(response) ||
    events.some((event) => String(event.type ?? "").includes("completed"));
  const modelRounds = countModelRounds(events, streamLines);
  const toolCount = tools.length || countToolMentions(events, streamLines);
  const slowestTool = tools
    .filter((tool) => typeof tool.durationMs === "number")
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))[0];
  const totalDurationMs =
    durationFromEvents(events) ?? durationFromStream(streamLines);
  const headline = buildRunHeadline({
    completed,
    explicitOk,
    failedToolCount,
    toolCount,
    permissions,
    artifacts,
  });

  return {
    started: events.length > 0 || streamLines.length > 0,
    completed,
    ok: explicitOk,
    modelRounds,
    toolCount,
    failedToolCount,
    totalDurationMs,
    slowestTool,
    tools,
    permissions,
    artifacts,
    headline,
  };
}

function toolsFromEvents(
  events: Array<Record<string, unknown>>,
): RunToolEvent[] {
  return events.flatMap((event) => {
    const type = String(event.type ?? event.event ?? "");
    const name = String(event.tool ?? event.name ?? event.tool_name ?? "");
    if (!name && !type.includes("tool")) return [];
    const detail = pretty(
      event.command ??
        event.path ??
        event.file ??
        event.detail ??
        event.error ??
        event.content ??
        "",
    );
    return [
      {
        name: name || type || "tool",
        status: statusFromEvent(event),
        detail,
        durationMs: numberFrom(
          event.duration_ms ?? event.elapsed_ms ?? event.ms,
        ),
        path: stringFrom(event.path ?? event.file ?? event.file_path),
      },
    ];
  });
}

function toolsFromStream(lines: string[]): RunToolEvent[] {
  return lines.flatMap<RunToolEvent>((line): RunToolEvent[] => {
    const toolStart = line.match(
      /(?:🔧|tool)\s+([a-zA-Z0-9_-]+)(?:\s+\[[^\]]+\])?\s*(.*)$/,
    );
    if (toolStart) {
      const detail = toolStart[2]?.trim() ?? "";
      return [
        {
          name: toolStart[1],
          status: "running",
          detail,
          path: pathFromText(detail),
        } satisfies RunToolEvent,
      ];
    }
    const finished = line.match(
      /->\s+([a-zA-Z0-9_-]+)\s+finished\s+in\s+([0-9.]+)\s*(ms|s)\s*(?:\(([^)]*)\))?/,
    );
    if (finished) {
      const duration =
        Number.parseFloat(finished[2]) * (finished[3] === "s" ? 1000 : 1);
      const detail = finished[4] ?? "";
      return [
        {
          name: finished[1],
          status: detail.toLowerCase().includes("fail") ? "failed" : "ok",
          detail,
          durationMs: duration,
        } satisfies RunToolEvent,
      ];
    }
    return [];
  });
}

function permissionsFromEvents(
  events: Array<Record<string, unknown>>,
): RunPermission[] {
  return events.flatMap((event) => {
    const type = String(event.type ?? event.event ?? "").toLowerCase();
    const command = stringFrom(
      event.command ?? event.run ?? event.shell ?? event.detail,
    );
    if (!type.includes("permission") && !command) return [];
    if (
      !type.includes("permission") &&
      !String(event.status ?? "")
        .toLowerCase()
        .includes("permission")
    )
      return [];
    return [
      {
        command,
        status: permissionStatus(event),
        detail: pretty(event.reason ?? event.detail ?? event.status ?? ""),
      },
    ];
  });
}

function permissionsFromStream(lines: string[]): RunPermission[] {
  return lines.flatMap((line) => {
    if (!/permission|required|approve/i.test(line)) return [];
    const command =
      line.match(/Run:\s*`([^`]+)`/)?.[1] ??
      line.match(/run_shell[^\]]*\]\s*(.*)$/)?.[1] ??
      "";
    return [
      {
        command,
        status: /denied|blocked|failed/i.test(line) ? "blocked" : "requested",
        detail: line,
      },
    ];
  });
}

function artifactsFromEvents(
  events: Array<Record<string, unknown>>,
): RunArtifact[] {
  return events.flatMap((event) => {
    const path = stringFrom(
      event.path ?? event.file ?? event.file_path ?? event.output_path,
    );
    const type = String(event.type ?? event.event ?? event.tool ?? "");
    if (!path || !looksLikeArtifactPath(path)) return [];
    return [
      {
        path,
        kind: artifactKind(path, type),
        detail: pretty(event.bytes ?? event.detail ?? event.status ?? type),
      },
    ];
  });
}

function artifactsFromResponse(
  response: Record<string, unknown> | null,
): RunArtifact[] {
  if (!response) return [];
  const candidates = [
    response.files,
    response.files_touched,
    response.artifacts,
    response.outputs,
    response.paths,
  ];
  return candidates.flatMap((candidate) => artifactList(candidate));
}

function artifactsFromStream(lines: string[]): RunArtifact[] {
  return lines.flatMap((line) => {
    const match = line.match(
      /(?:write_file|create_docx|create_pptx|create_svg|create_diagram|create_image|generate_image)[^\n]*\s(\/[^\s]+|[\w.-]+\/[^\s]+|[\w.-]+\.[a-zA-Z0-9]+)/,
    );
    if (!match) return [];
    return [
      { path: match[1], kind: artifactKind(match[1], line), detail: line },
    ];
  });
}

function artifactList(candidate: unknown): RunArtifact[] {
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((item) => {
    if (typeof item === "string" && looksLikeArtifactPath(item))
      return [{ path: item, kind: artifactKind(item), detail: "" }];
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const path = stringFrom(
      record.path ?? record.file ?? record.file_path ?? record.name,
    );
    if (!path || !looksLikeArtifactPath(path)) return [];
    return [
      {
        path,
        kind: artifactKind(path, stringFrom(record.kind ?? record.type)),
        detail: pretty(record.detail ?? record.status ?? ""),
      },
    ];
  });
}

function mergeTools(tools: RunToolEvent[]) {
  const byKey = new Map<string, RunToolEvent>();
  for (const tool of tools) {
    const relatedKey = Array.from(byKey.keys()).find((key) => {
      const existing = byKey.get(key);
      return (
        existing?.name === tool.name &&
        (!existing.path || !tool.path || existing.path === tool.path)
      );
    });
    const key = relatedKey ?? `${tool.name}:${tool.path ?? tool.detail}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      statusRank(tool.status) >= statusRank(existing.status) ||
      (tool.durationMs ?? 0) > (existing.durationMs ?? 0)
    ) {
      byKey.set(key, {
        ...existing,
        ...tool,
        detail: tool.detail || existing?.detail || "",
      });
    }
  }
  return Array.from(byKey.values()).slice(-24);
}

function mergePermissions(permissions: RunPermission[]) {
  const byKey = new Map<string, RunPermission>();
  for (const permission of permissions)
    byKey.set(permission.command || permission.detail, permission);
  return Array.from(byKey.values()).slice(-12);
}

function mergeArtifacts(artifacts: RunArtifact[]) {
  const byPath = new Map<string, RunArtifact>();
  for (const artifact of artifacts) byPath.set(artifact.path, artifact);
  return Array.from(byPath.values()).slice(-16);
}

function statusFromEvent(
  event: Record<string, unknown>,
): RunToolEvent["status"] {
  const text =
    `${event.status ?? ""} ${event.ok ?? ""} ${event.error ?? ""}`.toLowerCase();
  if (text.includes("permission") || text.includes("blocked")) return "blocked";
  if (text.includes("fail") || text.includes("error") || text.includes("false"))
    return "failed";
  if (text.includes("ok") || text.includes("true") || text.includes("success"))
    return "ok";
  if (
    String(event.type ?? "")
      .toLowerCase()
      .includes("start")
  )
    return "running";
  return "unknown";
}

function permissionStatus(
  event: Record<string, unknown>,
): RunPermission["status"] {
  const text =
    `${event.status ?? ""} ${event.type ?? ""} ${event.ok ?? ""}`.toLowerCase();
  if (text.includes("denied")) return "denied";
  if (text.includes("blocked") || text.includes("required")) return "blocked";
  if (text.includes("approved") || text.includes("true")) return "approved";
  return "requested";
}

function artifactKind(path: string, hint = ""): RunArtifact["kind"] {
  const text = `${path} ${hint}`.toLowerCase();
  if (/\.(docx|pptx|pdf|xlsx|csv|md|txt)$/.test(text)) return "document";
  if (/\.(png|jpe?g|gif|webp)$/.test(text)) return "image";
  if (/\.(svg|mmd)$/.test(text) || text.includes("diagram")) return "diagram";
  if (/\.[a-z0-9]+$/.test(path)) return "file";
  return "unknown";
}

function looksLikeArtifactPath(path: string) {
  return /(^\/|\.)([a-zA-Z0-9]{1,8})$/.test(path) || path.includes("/");
}

function countModelRounds(
  events: Array<Record<string, unknown>>,
  lines: string[],
) {
  const eventCount = events.filter((event) =>
    String(event.type ?? event.event ?? "")
      .toLowerCase()
      .includes("model"),
  ).length;
  const streamCount = lines.filter((line) =>
    /time model round/i.test(line),
  ).length;
  return Math.max(eventCount, streamCount);
}

function countToolMentions(
  events: Array<Record<string, unknown>>,
  lines: string[],
) {
  const eventCount = events.filter((event) =>
    String(event.type ?? event.event ?? event.tool ?? "")
      .toLowerCase()
      .includes("tool"),
  ).length;
  const streamCount = lines.filter((line) =>
    /(?:🔧|->\s+[a-zA-Z0-9_-]+\s+finished)/.test(line),
  ).length;
  return Math.max(eventCount, streamCount);
}

function durationFromEvents(events: Array<Record<string, unknown>>) {
  const durations = events
    .map((event) =>
      numberFrom(event.duration_ms ?? event.elapsed_ms ?? event.ms),
    )
    .filter((item): item is number => typeof item === "number");
  return durations.length
    ? durations.reduce((total, item) => total + item, 0)
    : undefined;
}

function durationFromStream(lines: string[]) {
  const durations = lines.flatMap((line) => {
    const match = line.match(
      /responded in ([0-9.]+)s|finished in ([0-9.]+)\s*(ms|s)/i,
    );
    if (!match) return [];
    if (match[1]) return [Number.parseFloat(match[1]) * 1000];
    return [Number.parseFloat(match[2]) * (match[3] === "s" ? 1000 : 1)];
  });
  return durations.length
    ? durations.reduce((total, item) => total + item, 0)
    : undefined;
}

function buildRunHeadline(input: {
  completed: boolean;
  explicitOk: boolean | null;
  failedToolCount: number;
  toolCount: number;
  permissions: RunPermission[];
  artifacts: RunArtifact[];
}) {
  if (!input.completed)
    return input.toolCount
      ? "Running with live tool activity"
      : "Waiting for MagAgent activity";
  if (input.explicitOk === false || input.failedToolCount)
    return "Completed with issues to review";
  if (
    input.permissions.some(
      (permission) =>
        permission.status === "blocked" || permission.status === "denied",
    )
  )
    return "Completed after permission friction";
  if (input.artifacts.length)
    return `Completed with ${input.artifacts.length} artifact${input.artifacts.length === 1 ? "" : "s"}`;
  return "Completed";
}

function statusRank(status: RunToolEvent["status"]) {
  return { running: 0, unknown: 1, ok: 2, blocked: 3, failed: 4 }[status];
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value : "";
}

function pathFromText(value: string) {
  return value.match(/(\/[^\s]+|[\w.-]+\/[^\s]+|[\w.-]+\.[a-zA-Z0-9]+)/)?.[1];
}
