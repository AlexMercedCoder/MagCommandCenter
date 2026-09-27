/**
 * Per-run memory evidence from MagAgent 1.4 (G-3): which memories a run recalled,
 * their scores, and how much of the context budget they used.
 * Schema: magent.run-memory-evidence.v1 with magent.memory-evidence.v1 turns.
 */
import { parseJson, runMagent } from "../magent";

export type EvidenceNode = {
  id: string;
  type?: string;
  score?: number;
  matched?: string[];
  reason?: string;
};

export type EvidenceTurn = {
  schema?: string;
  turn: number;
  recorded_at?: string;
  status: "used" | "no_match" | "unavailable" | "blocked_by_profile" | string;
  query_preview?: string;
  nodes: EvidenceNode[];
  tokens: {
    recalled: number;
    injected: number;
    budget: number;
    profile_reserve?: number;
  };
  truncated: boolean;
  truncation?: string[];
};

export type RunMemoryEvidence = {
  ok: true;
  task_id: string;
  title?: string;
  state?: string;
  provider?: string;
  model?: string;
  turns: EvidenceTurn[];
  summary: {
    turns: number;
    turns_with_memory: number;
    unique_nodes: string[];
    tokens_injected: number;
    truncated: boolean;
  };
};

export type EvidenceResult =
  RunMemoryEvidence | { ok: false; error: string; hint?: string };

export const statusLabels: Record<string, string> = {
  used: "Memory used",
  no_match: "No memory matched",
  unavailable: "Memory graph unavailable",
  blocked_by_profile: "The agent profile does not allow memory reads",
};

export async function loadMemoryEvidence(
  taskId: string,
): Promise<EvidenceResult> {
  const result = await runMagent(["memory", "evidence", taskId, "--json"]);
  const data = parseJson<EvidenceResult>(result);
  if (data && typeof data === "object" && "ok" in data) return data;
  const text = (result.stderr || result.stdout).trim();
  return {
    ok: false,
    error: /no such command|usage/i.test(text)
      ? "This MagAgent does not report memory evidence."
      : text.split(/\r?\n/).slice(-1)[0] ||
        "MagAgent did not return memory evidence.",
    hint: "Memory evidence needs MagAgent 1.4 or newer.",
  };
}

/** Budget share of the largest injection in a run, as a percentage (0-100). */
export function peakBudgetShare(evidence: RunMemoryEvidence): number {
  let peak = 0;
  for (const turn of evidence.turns) {
    if (turn.tokens.budget > 0)
      peak = Math.max(peak, turn.tokens.injected / turn.tokens.budget);
  }
  return Math.round(Math.min(1, peak) * 100);
}

/** Evidence embedded in an `ask --json` result or a `memory_recalled` event. */
export function evidenceFromAsk(
  response: Record<string, unknown> | null,
): EvidenceTurn[] {
  const turns = response?.memory_evidence;
  return Array.isArray(turns) ? (turns as EvidenceTurn[]) : [];
}
