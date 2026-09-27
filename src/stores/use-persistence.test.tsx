import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAppState, saveAppState } from "../lib/persistence";
import { useChatStore, initialChatState } from "../features/chat/chat-store";
import { useSqliteStore } from "../features/sqlite/sqlite-store";
import { initialAppState, useAppStore } from "./app-store";
import { usePersistence } from "./use-persistence";

const stored: Record<string, unknown> = {};
vi.mock("../lib/persistence", () => ({
  loadAppState: vi.fn(async (key: string, fallback: unknown) =>
    key in stored ? stored[key] : fallback,
  ),
  saveAppState: vi.fn(async (key: string, value: unknown) => {
    stored[key] = value;
  }),
}));

function Harness() {
  usePersistence(0);
  return null;
}

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  vi.mocked(saveAppState).mockClear();
  vi.mocked(loadAppState).mockClear();
  localStorage.clear();
  useAppStore.setState(initialAppState());
  useChatStore.setState(initialChatState());
});

describe("usePersistence", () => {
  it("hydrates, then saves changed fields and per-project chat state", async () => {
    Object.assign(stored, {
      "mcc.project": "/work/a",
      "mcc.theme": "dark",
      "mcc.chatSessions:/work/a": [{ id: "s1", name: "one" }],
      "mcc.chatHistory:/work/a:s1": [
        { id: "m", role: "user", content: "hi", createdAt: "t" },
      ],
      "mcc.sqliteSavedQueries": ["select 1"],
    });
    render(<Harness />);
    await waitFor(() =>
      expect(useAppStore.getState().persistenceReady).toBe(true),
    );
    expect(useAppStore.getState()).toMatchObject({
      project: "/work/a",
      theme: "dark",
    });
    expect(useSqliteStore.getState().savedQueries).toEqual(["select 1"]);
    await waitFor(() => expect(useChatStore.getState().session).toBe("s1"));
    await waitFor(() =>
      expect(useChatStore.getState().history[0]?.content).toBe("hi"),
    );

    act(() => useAppStore.getState().set({ accent: "violet" }));
    expect(stored["mcc.accent"]).toBe("violet");

    act(() =>
      useChatStore
        .getState()
        .setHistory((current) => [
          ...current,
          { id: "n", role: "agent", content: "hello", createdAt: "t" },
        ]),
    );
    expect((stored["mcc.chatHistory:/work/a:s1"] as unknown[]).length).toBe(2);

    act(() => useAppStore.getState().set({ project: "/work/b" }));
    expect(stored["mcc.project"]).toBe("/work/b");
    await waitFor(() =>
      expect(useChatStore.getState().sessions[0]?.id).toBe("default"),
    );
  });

  it("keeps rail and shortcut preferences in localStorage", () => {
    render(<Harness />);
    act(() => useAppStore.getState().set({ railCollapsed: true }));
    expect(localStorage.getItem("mcc.railCollapsed")).toBe("true");
  });
});
