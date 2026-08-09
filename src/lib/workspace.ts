import type { ChatMessage, ChatSession } from "./types";

export function withPagination(query: string, page: number) {
  const normalized = query.trim().replace(/;$/, "");
  if (/\blimit\b/i.test(normalized)) return normalized;
  return `${normalized} limit 100 offset ${Math.max(0, page) * 100}`;
}

export function newChatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() };
}

export function summarizeOrchestratedGoal(data: Record<string, unknown> | null) {
  if (!data) return "";
  const plan = data.plan as Record<string, unknown> | undefined;
  const orchestration = data.orchestration as Record<string, unknown> | undefined;
  const planId = String(plan?.id ?? "");
  const cacheKey = String(orchestration?.cache_key ?? "");
  const steps = Array.isArray(orchestration?.steps) ? orchestration.steps.length : 0;
  if (!planId) return "";
  return [
    `Created staged goal ${planId}.`,
    cacheKey ? `Cache key: ${cacheKey}.` : "",
    `${steps} staged step${steps === 1 ? "" : "s"} prepared.`,
    `Preview with: magent goal-run ${planId} --dry-run`,
    `Run with: magent goal-run ${planId}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeSessions(value: unknown): ChatSession[] {
  const now = new Date().toISOString();
  if (!Array.isArray(value)) return [defaultSession(now)];
  const sessions = value
    .map((item): ChatSession | null => {
      if (typeof item === "string") return { id: item, name: item, createdAt: now, updatedAt: now };
      if (typeof item !== "object" || item === null) return null;
      const record = item as Partial<ChatSession>;
      const id = record.id || record.name;
      if (!id) return null;
      return {
        id,
        name: record.name || id,
        createdAt: record.createdAt || now,
        updatedAt: record.updatedAt || record.createdAt || now,
        summary: record.summary
      };
    })
    .filter((item): item is ChatSession => Boolean(item));
  return sessions.length ? sessions : [defaultSession(now)];
}

function defaultSession(now: string): ChatSession {
  return { id: "default", name: "default", createdAt: now, updatedAt: now };
}
