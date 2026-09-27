import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperimentalPanel } from "./experimental-panel";
import {
  configureNativeTransport,
  configureRemoteTransport,
  runtimeTransportKind,
} from "../lib/desktop";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  configureNativeTransport();
});

describe("ExperimentalPanel", () => {
  it("hides the remote runtime on a default install", () => {
    render(<ExperimentalPanel notify={vi.fn()} />);
    expect(
      screen.getByRole("checkbox", { name: /remote runtime/i }),
    ).not.toBeChecked();
    expect(screen.queryByLabelText(/gateway endpoint/i)).toBeNull();
    expect(
      screen.getByText(/no magagent release ships that gateway/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Experimental")).toHaveLength(3);
  });

  it("shows the connection form only after opting in, and remembers the choice", () => {
    const { unmount } = render(<ExperimentalPanel notify={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /remote runtime/i }));
    expect(screen.getByLabelText(/gateway endpoint/i)).toBeInTheDocument();
    unmount();
    render(<ExperimentalPanel notify={vi.fn()} />);
    expect(
      screen.getByRole("checkbox", { name: /remote runtime/i }),
    ).toBeChecked();
  });

  it("turning the flag off drops an active remote transport", () => {
    localStorage.setItem("mcc.experimental.remoteRuntime", "true");
    configureRemoteTransport("https://agent.example/rpc", "token");
    const notify = vi.fn();
    render(<ExperimentalPanel notify={notify} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /remote runtime/i }));
    expect(runtimeTransportKind()).toBe("native");
    expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(/native desktop runtime/),
      "good",
    );
    expect(localStorage.getItem("mcc.experimental.remoteRuntime")).toBeNull();
  });
});
