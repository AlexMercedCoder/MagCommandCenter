import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgenticGraphDocument } from "../../../lib/types";
import { NodeEditor } from "./node-editor";

const document: AgenticGraphDocument = {
  ags_version: "1.0",
  kind: "AgenticGraph",
  id: "test/board",
  title: "Board",
  objective: "Test",
  entrypoints: ["inspect"],
  nodes: {
    inspect: { title: "Inspect", description: "Inspect files" },
    plan: { title: "Plan", description: "Plan", depends_on: ["inspect"] },
  },
};

function editor(id: "inspect" | "plan", onRename = vi.fn()) {
  return (
    <NodeEditor
      id={id}
      node={document.nodes[id]}
      document={document}
      profiles={[]}
      effective={null}
      onChange={vi.fn()}
      onType={vi.fn()}
      onDelete={vi.fn()}
      onRename={onRename}
    />
  );
}

describe("NodeEditor", () => {
  it("shows the selected card's id after the selection changes", () => {
    // Regression: the uncontrolled id field kept the first card's id, so Rename
    // would have renamed the newly selected card to the old id.
    const onRename = vi.fn();
    const { rerender, container } = render(editor("inspect", onRename));
    const idField = () => container.querySelector("#graph-node-id");
    expect(idField()).toHaveValue("inspect");
    rerender(editor("plan", onRename));
    expect(idField()).toHaveValue("plan");
    screen.getByRole("button", { name: "Rename" }).click();
    expect(onRename).not.toHaveBeenCalled();
  });
});
