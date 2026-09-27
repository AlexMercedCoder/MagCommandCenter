import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyProgress,
  idleRun,
  runPercent,
  startedRun,
  type ManagedProgressEvent,
} from "../lib/managed-install";
import { ManagedInstallPanel } from "./managed-install-panel";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const status = {
  root: "/home/a/.local/share/com.mag.commandcenter/managed-magent",
  installed: null,
  magent: null,
  running: false,
  system_uv: null,
  uv_download_available: true,
  pinned_magent: "1.4.0",
  pinned_python: "3.12",
  pinned_uv: "0.6.14",
};

const event = (
  partial: Partial<ManagedProgressEvent>,
): ManagedProgressEvent => ({
  step: "uv",
  index: 1,
  total: 5,
  label: "",
  state: "running",
  line: null,
  ...partial,
});

let emit: (payload: ManagedProgressEvent) => void = () => undefined;

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockImplementation(async (_name, handler) => {
    emit = (payload) =>
      (handler as (e: { payload: ManagedProgressEvent }) => void)({
        payload,
      });
    return () => undefined;
  });
});

describe("managed install progress", () => {
  it("tracks steps, output lines, and the final state", () => {
    let run = startedRun();
    run = applyProgress(run, event({ label: "Downloading uv 0.6.14" }));
    expect(run.steps.uv).toEqual({
      state: "running",
      detail: "Downloading uv 0.6.14",
    });
    run = applyProgress(run, event({ state: "done", label: "Using uv" }));
    run = applyProgress(run, event({ step: "python", index: 2 }));
    run = applyProgress(run, event({ step: "python", line: "Installed 1" }));
    expect(run.lines).toEqual(["Installed 1"]);
    expect(runPercent(run)).toBe(20);
    run = applyProgress(
      run,
      event({ step: "error", state: "failed", label: "Python install failed" }),
    );
    expect(run.phase).toBe("failed");
    expect(run.steps.python.state).toBe("failed");
    expect(run.message).toBe("Python install failed");
    expect(
      applyProgress(
        startedRun(),
        event({ step: "error", state: "cancelled", label: "Cancelled." }),
      ).phase,
    ).toBe("cancelled");
  });

  it("keeps only the most recent output lines", () => {
    let run = idleRun();
    for (let index = 0; index < 250; index += 1)
      run = applyProgress(run, event({ line: `line ${index}` }));
    expect(run.lines).toHaveLength(200);
    expect(run.lines[0]).toBe("line 50");
  });
});

describe("ManagedInstallPanel", () => {
  it("explains the install, then shows live steps and a success", async () => {
    let finish: (value: unknown) => void = () => undefined;
    vi.mocked(invoke).mockImplementation((command) =>
      command === "managed_install_start"
        ? new Promise((resolve) => (finish = resolve))
        : Promise.resolve(status),
    );
    const notify = vi.fn();
    const onInstalled = vi.fn();
    render(<ManagedInstallPanel notify={notify} onInstalled={onInstalled} />);
    expect(
      await screen.findByText(/Downloads uv 0.6.14 from GitHub/),
    ).toBeInTheDocument();
    expect(screen.getByText("Experimental")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Install MagAgent 1.4.0" }),
    );
    expect(
      screen.getByRole("button", { name: "Cancel install" }),
    ).toBeInTheDocument();
    act(() => {
      emit(event({ state: "done", label: "Using uv at /x/uv (downloaded)" }));
      emit(
        event({ step: "python", index: 2, label: "Installing Python 3.12" }),
      );
      emit(
        event({ step: "python", index: 2, line: "Installed Python 3.12.9" }),
      );
    });
    expect(screen.getByText("Using uv at /x/uv (downloaded)")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "20",
    );
    expect(screen.getByText("Install log (1 line)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel install" }));
    expect(invoke).toHaveBeenCalledWith("managed_install_cancel");

    await act(async () => {
      emit(
        event({
          step: "done",
          state: "done",
          label: "MagAgent 1.4.0 is installed",
        }),
      );
      finish({ magent_version: "1.4.0" });
    });
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("MagAgent 1.4.0 is installed"),
      "good",
    );
    expect(onInstalled).toHaveBeenCalled();
  });

  it("shows why an install failed with the log open", async () => {
    vi.mocked(invoke).mockImplementation((command) =>
      command === "managed_install_start"
        ? Promise.reject(new Error("Installing MagAgent failed"))
        : Promise.resolve(status),
    );
    render(<ManagedInstallPanel notify={vi.fn()} onInstalled={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Install MagAgent 1.4.0" }),
    );
    act(() => {
      emit(event({ step: "magent", index: 4, label: "Installing mag-agent" }));
      emit(event({ step: "magent", index: 4, line: "No solution found" }));
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Installing MagAgent failed",
    );
    expect(screen.getByText("No solution found")).toBeVisible();
  });

  it("removes an existing install only after confirmation", async () => {
    vi.mocked(invoke).mockResolvedValue({
      ...status,
      system_uv: "/usr/bin/uv",
      installed: {
        schema: "mag-command-center.managed-magent.v1",
        magent_version: "1.4.0",
        env: "env-1",
        python: "3.12",
        uv: "/usr/bin/uv",
        uv_source: "system",
        requirements: ["mag-agent==1.4.0"],
        installed_at: 1,
      },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ManagedInstallPanel notify={vi.fn()} onInstalled={vi.fn()} />);
    expect(
      await screen.findByText(/is\s+installed and used for every run/),
    ).toBeInTheDocument();
    expect(screen.getByText("/usr/bin/uv (system)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(confirm).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith("managed_install_remove");
    confirm.mockReturnValue(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    });
    expect(invoke).toHaveBeenCalledWith("managed_install_remove");
    confirm.mockRestore();
  });
});
