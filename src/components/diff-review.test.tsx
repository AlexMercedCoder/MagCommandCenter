import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialAppState, useAppStore } from "../stores/app-store";
import { DiffReview } from "./diff-review";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,2 +10,3 @@
 const a = 1;
+const b = 2;
 return a;
`;

beforeEach(() => {
  useAppStore.setState({ ...initialAppState(), editor: "vscode" });
  vi.mocked(invoke).mockReset();
});

describe("DiffReview", () => {
  it("shows files, counts, and line-numbered hunks", () => {
    render(
      <DiffReview diff={diff} project="/p" label="Working diff" empty="none" />,
    );
    expect(
      screen.getByText("1 file changed ·", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("Added:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open at line 11" }),
    ).toBeInTheDocument();
  });

  it("opens the file at the changed line in the chosen editor", async () => {
    vi.mocked(invoke).mockResolvedValue("code");
    render(
      <DiffReview diff={diff} project="/p" label="Working diff" empty="none" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open at line 11" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_in_editor", {
        project: "/p",
        path: "src/app.ts",
        line: 11,
        editor: "vscode",
      }),
    );
    await waitFor(() =>
      expect(useAppStore.getState().toasts[0]?.text).toBe(
        "Opened app.ts in code.",
      ),
    );
  });

  it("reports editor failures and shows empty and non-diff states", async () => {
    vi.mocked(invoke).mockImplementation(async () => {
      throw new Error("Only files inside the active project can be opened.");
    });
    const { rerender } = render(
      <DiffReview
        diff={diff}
        project="/p"
        label="d"
        empty="Nothing to review."
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Open in editor/ }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts[0]?.text).toMatch(
        /inside the active project/,
      ),
    );
    rerender(
      <DiffReview diff="" project="/p" label="d" empty="Nothing to review." />,
    );
    expect(screen.getByText("Nothing to review.")).toBeInTheDocument();
    rerender(
      <DiffReview
        diff="No changes in this view."
        project="/p"
        label="d"
        empty="x"
      />,
    );
    expect(screen.getByLabelText("d")).toHaveTextContent(
      "No changes in this view.",
    );
  });
});
