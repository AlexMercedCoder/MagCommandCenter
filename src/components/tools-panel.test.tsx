import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolsPanel } from "./tools-panel";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue({
    ok: false,
    command: "magent",
    stdout: "",
    stderr: "MagAgent is not installed.",
    status: 1,
  });
});

describe("ToolsPanel", () => {
  it("does not toast the automatic inventory check, only an explicit refresh", async () => {
    const notify = vi.fn();
    render(<ToolsPanel project="/tmp/project" notify={notify} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Refresh/ })).toBeEnabled(),
    );
    expect(notify).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining("inventory checks need review"),
        "bad",
      ),
    );
  });
});
