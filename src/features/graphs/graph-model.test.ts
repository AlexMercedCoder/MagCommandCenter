import { describe, expect, it } from "vitest";
import type { AgenticGraphDocument } from "../../lib/types";
import { addNode, duplicateNodeLocal, fallbackNodeTemplate, filterNodeIds, graphDiagnostics, graphStages, localDraftFromGoal, measureGraphModel, removeNode, replaceNodeType, sourceDiff, updateNode } from "./graph-model";

const graph: AgenticGraphDocument = { ags_version: "1.0", kind: "AgenticGraph", id: "test/board", title: "Board", objective: "Test", entrypoints: ["a"], nodes: { a: { title: "A", description: "A" }, b: { title: "B", description: "B", depends_on: ["a"] }, c: { title: "C", description: "C", depends_on: ["a"] } } };

describe("graph board model", () => {
  it("groups parallel cards into computed execution stages", () => {
    expect(graphStages(graph)).toEqual({ stages: [{ level: 0, nodeIds: ["a"] }, { level: 1, nodeIds: ["b", "c"] }], cycle: false });
  });

  it("creates a valid local draft for browser previews", () => {
    const draft = localDraftFromGoal("Improve the command center UI");
    expect(draft.entrypoints).toEqual(["inspect"]);
    expect(graphStages(draft).stages).toHaveLength(5);
    expect(graphDiagnostics(draft).filter((item) => item.severity === "error")).toEqual([]);
  });

  it("detects cycles and maintains dependencies when editing", () => {
    const cycled = updateNode(graph, "a", { depends_on: ["b"] });
    expect(graphStages(cycled).cycle).toBe(true);
    expect(removeNode(graph, "a").nodes.b.depends_on).toEqual([]);
    expect(Object.keys(addNode(graph).nodes)).toContain("task_4");
  });

  it("creates and safely replaces every supported node type", () => {
    for (const type of ["task", "decision", "gate", "loop", "map", "subgraph"] as const) {
      const added = addNode(graph, type);
      const ids = Object.keys(added.nodes);
      const id = ids[ids.length - 1];
      expect(added.nodes[id].type).toBe(type);
      const replaced = replaceNodeType(added, id, "gate");
      expect(replaced.nodes[id].gate).toMatchObject({ mode: "approve" });
      expect(replaced.nodes[id].loop).toBeUndefined();
    }
    expect(fallbackNodeTemplate("map").map).toMatchObject({ max_items: 10 });
  });

  it("duplicates, filters, diffs, and diagnoses graph drafts", () => {
    const duplicated = duplicateNodeLocal(graph, "a");
    expect(duplicated.id).toBe("a_copy");
    const labeled = updateNode(duplicated.document, "b", { labels: ["review"], "x-magagent-profile": "docs" });
    expect(filterNodeIds(labeled, "", "", "docs", "review")).toEqual(new Set(["b"]));
    expect(sourceDiff(graph, labeled).some((line) => line.includes("review"))).toBe(true);
    const broken = updateNode(labeled, "b", { depends_on: ["missing"] });
    expect(graphDiagnostics(broken).map((item) => item.code)).toContain("unknown_dependency");
  });

  it("keeps 500-node graph analysis within the interactive budget", () => {
    const nodes: AgenticGraphDocument["nodes"] = {};
    for (let index = 0; index < 500; index += 1) nodes[`node_${index}`] = { title: `Node ${index}`, description: "Work", ...(index ? { depends_on: [`node_${index - 1}`] } : {}) };
    const large = { ...graph, entrypoints: ["node_0"], nodes };
    expect(measureGraphModel(large)).toBeLessThan(50);
  });
});
