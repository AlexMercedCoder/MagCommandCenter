import { invoke } from "@tauri-apps/api/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalCenter } from "./approval-center";
import type { PendingAAISApproval } from "../magent";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

const request: PendingAAISApproval = {
  streamId: "stream-1",
  envelope: {
    aais: "1.0",
    type: "approval.requested",
    id: "event-request",
    occurred_at: "2026-09-27T00:00:00Z",
    sequence: 1,
    stream: "authority",
    request: {
      id: "request-esc",
      action_digest: "sha256:abc",
      action: {
        kind: "tool.call",
        name: "shell.exec",
        summary: "Run the test suite",
        arguments: { command: "npm test" },
      },
      risk: { level: "medium", reasons: ["Runs a process"] },
      choices: [
        { decision: "approve", scope: "once", label: "Allow once" },
        { decision: "deny", scope: "once", label: "Deny" },
      ],
    },
  },
};

let snapshot: Record<string, unknown>;

beforeEach(() => {
  sessionStorage.clear();
  snapshot = { pending: [request], receipts: [], interrupted: [] };
  mockedInvoke.mockReset();
  mockedInvoke.mockImplementation(async (command) => {
    if (command === "approval_snapshot") return snapshot;
    return true;
  });
});

describe("ApprovalCenter", () => {
  it("offers Deny as an explicit, focusable button in the tab order", async () => {
    render(<ApprovalCenter notify={vi.fn()} />);
    const dialog = await screen.findByRole("alertdialog");
    const deny = screen.getByRole("button", { name: "Deny" });
    expect(deny).toBeEnabled();
    expect(deny.tabIndex).toBeGreaterThanOrEqual(0);

    const user = userEvent.setup();
    const reached: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      reached.push(document.activeElement?.textContent ?? "");
    }
    expect(reached).toContain("Deny");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("Escape dismisses the dialog but leaves the request pending", async () => {
    render(<ApprovalCenter notify={vi.fn()} />);
    await screen.findByRole("alertdialog");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    const waiting = screen.getByRole("button", {
      name: /1 permission request waiting/i,
    });
    expect(
      mockedInvoke.mock.calls.some((call) => call[0] === "write_magent_stream"),
    ).toBe(false);

    fireEvent.click(waiting);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Run the test suite")).toBeInTheDocument();
  });

  it("Decide later behaves like Escape", async () => {
    render(<ApprovalCenter notify={vi.fn()} />);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Decide later" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /permission request waiting/i }),
    ).toBeInTheDocument();
  });

  it("reports an interrupted outcome when the run exits before a decision", async () => {
    const notify = vi.fn();
    render(<ApprovalCenter notify={notify} />);
    await screen.findByRole("alertdialog");

    snapshot = {
      pending: [],
      receipts: [],
      interrupted: [
        {
          streamId: "stream-1",
          requestId: "request-esc",
          actionName: "shell.exec",
          exitCode: 1,
          outcome: "interrupted",
          message: "native message",
        },
      ],
    };
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Approval interrupted: .*shell\.exec.*Nothing was approved/,
        ),
        "bad",
      ),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /permission request waiting/i }),
    ).not.toBeInTheDocument();
  });
});
