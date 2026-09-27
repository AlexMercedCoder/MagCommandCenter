import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import {
  evidenceFromAsk,
  loadMemoryEvidence,
  peakBudgetShare,
  type RunMemoryEvidence,
} from "./memory-evidence";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const evidence: RunMemoryEvidence = {
  ok: true,
  task_id: "task_1",
  turns: [
    {
      turn: 1,
      status: "used",
      nodes: [{ id: "n1", score: 0.8 }],
      tokens: { recalled: 900, injected: 600, budget: 4000 },
      truncated: false,
    },
    {
      turn: 2,
      status: "used",
      nodes: [],
      tokens: { recalled: 5000, injected: 4000, budget: 4000 },
      truncated: true,
      truncation: ["recall_budget"],
    },
  ],
  summary: {
    turns: 2,
    turns_with_memory: 2,
    unique_nodes: ["n1"],
    tokens_injected: 4600,
    truncated: true,
  },
};

describe("memory evidence", () => {
  it("loads the run evidence through the MagAgent CLI", async () => {
    vi.mocked(invoke).mockResolvedValue({
      ok: true,
      command: "magent memory evidence task_1 --json",
      stdout: JSON.stringify(evidence),
      stderr: "",
      status: 0,
    });
    await expect(loadMemoryEvidence("task_1")).resolves.toEqual(evidence);
    expect(vi.mocked(invoke).mock.calls[0][1]).toEqual({
      args: ["memory", "evidence", "task_1", "--json"],
    });
  });

  it("explains older MagAgent versions without the command", async () => {
    vi.mocked(invoke).mockResolvedValue({
      ok: false,
      command: "magent",
      stdout: "",
      stderr: "Error: No such command 'evidence'.",
      status: 2,
    });
    const result = await loadMemoryEvidence("task_1");
    expect(result).toMatchObject({
      ok: false,
      error: "This MagAgent does not report memory evidence.",
    });
  });

  it("passes through MagAgent's own error and hint", async () => {
    vi.mocked(invoke).mockResolvedValue({
      ok: false,
      command: "magent",
      stdout: JSON.stringify({
        ok: false,
        error: "No execution task called x.",
        hint: "List tasks",
      }),
      stderr: "",
      status: 1,
    });
    await expect(loadMemoryEvidence("x")).resolves.toEqual({
      ok: false,
      error: "No execution task called x.",
      hint: "List tasks",
    });
  });

  it("reports the peak share of the recall budget", () => {
    expect(peakBudgetShare(evidence)).toBe(100);
    expect(evidenceFromAsk({ memory_evidence: evidence.turns })).toHaveLength(
      2,
    );
    expect(evidenceFromAsk(null)).toEqual([]);
  });
});
