import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialAppState, useAppStore } from "../../stores/app-store";
import { MemoryUsedPanel } from "./memory-used-panel";
import { useMemoryStore } from "./memory-store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const out = (stdout: unknown, ok = true) => ({
  ok,
  command: "magent",
  stdout: JSON.stringify(stdout),
  stderr: "",
  status: ok ? 0 : 1,
});

beforeEach(() => {
  useAppStore.setState(initialAppState());
  vi.mocked(invoke).mockReset();
});

describe("MemoryUsedPanel", () => {
  it("summarizes recalled memories and opens one in the Memory view", async () => {
    vi.mocked(invoke).mockResolvedValue(
      out({
        ok: true,
        task_id: "task_1",
        turns: [
          {
            turn: 1,
            status: "used",
            query_preview: "release notes",
            nodes: [
              {
                id: "note-42",
                type: "fact",
                score: 0.91,
                reason: "title match",
              },
            ],
            tokens: { recalled: 700, injected: 640, budget: 4000 },
            truncated: true,
            truncation: ["recall_budget"],
          },
          {
            turn: 2,
            status: "no_match",
            nodes: [],
            tokens: { recalled: 0, injected: 0, budget: 4000 },
            truncated: false,
          },
        ],
        summary: {
          turns: 2,
          turns_with_memory: 1,
          unique_nodes: ["note-42"],
          tokens_injected: 640,
          truncated: true,
        },
      }),
    );
    render(<MemoryUsedPanel taskId="task_1" />);
    expect(await screen.findByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("No memory matched")).toBeInTheDocument();
    expect(screen.getByText(/trimmed \(recall budget\)/)).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: /640 of 4000 tokens/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "note-42" }));
    expect(useAppStore.getState().view).toBe("memory");
    expect(useMemoryStore.getState().selectedNodeId).toBe("note-42");
  });

  it("explains when a run has no evidence", async () => {
    vi.mocked(invoke).mockResolvedValue(
      out(
        {
          ok: false,
          error: "No recorded run has memory evidence yet.",
          hint: "Runs record which memories they used from MagAgent 1.4 on.",
        },
        false,
      ),
    );
    render(<MemoryUsedPanel taskId="task_9" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(
      await screen.findByText("No memory evidence for this run"),
    ).toBeInTheDocument();
    expect(screen.getByText(/MagAgent 1.4 on/)).toBeInTheDocument();
  });
});
