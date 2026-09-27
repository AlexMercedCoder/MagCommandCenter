import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatesPanel } from "./updates-panel";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("UpdatesPanel", () => {
  it("points unsigned builds to GitHub Releases", async () => {
    vi.mocked(invoke).mockResolvedValue({
      configured: false,
      available: false,
      currentVersion: "1.0.0",
    });
    render(<UpdatesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText(/no update channel/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "GitHub Releases" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/AlexMercedCoder/MagCommandCenter/releases",
    );
  });

  it("offers a signed update and installs it on request", async () => {
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === "check_for_update"
        ? {
            configured: true,
            available: true,
            currentVersion: "1.0.0",
            version: "1.0.1",
            notes: "Fixes",
          }
        : undefined,
    );
    render(<UpdatesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(
      await screen.findByText("Version 1.0.1 is available"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Install and restart" }),
    );
    expect(await screen.findByText(/Downloading 1.0.1/)).toBeInTheDocument();
    expect(vi.mocked(invoke)).toHaveBeenLastCalledWith("install_update", {});
  });

  it("shows check failures", async () => {
    vi.mocked(invoke).mockImplementation(async () => {
      throw new Error("Could not check for updates: offline");
    });
    render(<UpdatesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(
      await screen.findByText("Could not check for updates: offline"),
    ).toHaveClass("updates-error");
  });
});
