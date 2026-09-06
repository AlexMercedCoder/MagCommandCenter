import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { magentClient } from "../magent";
import { useExecutionRuntime } from "./use-execution-runtime";
import type { ExecutionTask } from "../lib/types";

vi.mock("../magent", () => ({
  cancelMagentStream: vi.fn(),
  magentClient: {
    listTasks: vi.fn(),
    task: vi.fn(),
    events: vi.fn(),
    createTask: vi.fn(),
    action: vi.fn(),
  },
}));

const listTasks = vi.mocked(magentClient.listTasks);
const readTask = vi.mocked(magentClient.task);
const readEvents = vi.mocked(magentClient.events);

function task(overrides: Partial<ExecutionTask> = {}): ExecutionTask {
  return {
    id: "task-running",
    schema_version: "magent.task.v2",
    kind: "ask",
    title: "Build a site",
    state: "running",
    project_id: "project",
    project_path: "/repo",
    session_id: "default",
    parent_task_id: "",
    created_at: "2026-08-31T12:00:00Z",
    updated_at: "2026-08-31T12:00:01Z",
    started_at: "2026-08-31T12:00:01Z",
    finished_at: "",
    attempt: 1,
    usage: {},
    files_changed: [],
    checkpoints: [],
    final_audit: {},
    metadata: {},
    ...overrides,
  };
}

describe("useExecutionRuntime recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readEvents.mockResolvedValue([]);
  });

  it("selects and resumes polling a durable task after the UI restarts", async () => {
    const running = task();
    listTasks.mockResolvedValue([running]);
    readTask.mockResolvedValue(running);

    const { result, unmount } = renderHook(() => useExecutionRuntime("/repo"));

    await waitFor(() => expect(result.current.activeTask?.id).toBe(running.id));
    expect(result.current.recoveredTaskIds).toEqual([running.id]);
    expect(result.current.isActive).toBe(true);
    await waitFor(() => expect(readTask).toHaveBeenCalledWith(running.id));

    act(() => unmount());
  });

  it("does not select a finished task as recovered work", async () => {
    listTasks.mockResolvedValue([
      task({ id: "task-done", state: "completed" }),
    ]);

    const { result } = renderHook(() => useExecutionRuntime("/repo"));

    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(result.current.activeTask).toBeNull();
    expect(result.current.recoveredTaskIds).toEqual([]);
  });
});
