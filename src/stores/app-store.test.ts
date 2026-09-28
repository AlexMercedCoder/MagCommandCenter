import { DesktopUnavailableError } from "../lib/desktop";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectiveTheme,
  initialAppState,
  projectCrewFor,
  useAppStore,
} from "./app-store";

const app = () => useAppStore.getState();
const result = (ok: boolean) => ({
  ok,
  command: "magent x",
  stdout: "",
  stderr: "",
  status: ok ? 0 : 1,
});

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(initialAppState());
  vi.restoreAllMocks();
});

describe("app store", () => {
  it("collapses a repeated message into one toast with a count", () => {
    app().notify("other");
    app().notify("same");
    app().notify("same");
    expect(app().toasts.map((toast) => [toast.text, toast.count])).toEqual([
      ["same", 2],
      ["other", 1],
    ]);
  });

  it("keeps at most three toasts; others expire, errors wait to be dismissed", () => {
    vi.useFakeTimers();
    for (let index = 0; index < 6; index += 1) app().notify(`toast ${index}`);
    expect(app().toasts.map((toast) => toast.text)).toEqual([
      "toast 5",
      "toast 4",
      "toast 3",
    ]);
    app().notify("it broke", "bad");
    vi.advanceTimersByTime(5000);
    expect(app().toasts.map((toast) => toast.text)).toEqual(["it broke"]);
    app().dismissToast(app().toasts[0].id);
    expect(app().toasts).toEqual([]);
    vi.useRealTimers();
  });

  it("does not toast 'needs the desktop app' errors in the browser preview", () => {
    const internals = Object.getOwnPropertyDescriptor(
      window,
      "__TAURI_INTERNALS__",
    )!;
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    try {
      app().notify(new DesktopUnavailableError().message, "bad");
      expect(app().toasts).toEqual([]);
      app().notify("A real failure", "bad");
      expect(app().toasts).toHaveLength(1);
    } finally {
      Object.defineProperty(window, "__TAURI_INTERNALS__", internals);
    }
  });

  it("asks before leaving an unsaved Graph Board draft", () => {
    app().set({ view: "graphs", graphDirty: true, mobileNavOpen: true });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    app().navigate("chat");
    expect(app().view).toBe("graphs");
    confirm.mockReturnValue(true);
    app().navigate("chat");
    expect(app().view).toBe("chat");
    expect(app().mobileNavOpen).toBe(false);
    app().set({ graphDirty: false });
    confirm.mockClear();
    app().navigate("runs");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("records commands newest first, bounded, and toasts only failures", () => {
    app().recordCommand(result(true));
    app().recordCommand(
      { ...result(false), stderr: "Traceback\nNo active user." },
      true,
    );
    app().recordCommand(result(false), false);
    expect(app().commandHistory).toHaveLength(3);
    expect(app().lastCommand?.ok).toBe(false);
    expect(app().toasts.map((toast) => toast.text)).toEqual([
      "MagAgent could not finish: No active user.",
    ]);
    for (let index = 0; index < 90; index += 1)
      app().recordCommand(result(true), false);
    expect(app().commandHistory).toHaveLength(80);
  });

  it("remembers projects without duplicates and pins them", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    app().rememberProject(" /work/a ");
    app().rememberProject("/work/b");
    app().rememberProject("/work/a");
    expect(app().project).toBe("/work/a");
    expect(app().recentProjects).toEqual(["/work/a", "/work/b"]);
    app().rememberProject("   ");
    expect(app().project).toBe("/work/a");
    app().togglePinnedProject("/work/b");
    expect(app().pinnedProjects).toEqual(["/work/b"]);
    app().togglePinnedProject("/work/b");
    expect(app().pinnedProjects).toEqual([]);
  });

  it("stores a crew per project and resolves an empty default", () => {
    app().set({ project: "/work/a" });
    expect(projectCrewFor(app())).toEqual({
      project: "/work/a",
      coordinator: "",
      members: [],
    });
    app().updateProjectCrew({
      project: "/work/a",
      coordinator: "lead",
      members: [],
    });
    expect(projectCrewFor(app()).coordinator).toBe("lead");
  });

  it("resolves the system theme", () => {
    expect(effectiveTheme({ theme: "system", systemDark: true })).toBe("dark");
    expect(effectiveTheme({ theme: "system", systemDark: false })).toBe(
      "light",
    );
    expect(effectiveTheme({ theme: "dark", systemDark: false })).toBe("dark");
  });
});
