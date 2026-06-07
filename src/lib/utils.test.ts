import { describe, expect, it } from "vitest";
import {
  compareVersions,
  databaseValue,
  encodeFieldValue,
  extractDatabases,
  extractNodes,
  extractRows,
  extractTable,
  getNodeBody,
  listFromUnknown,
  parseVersion,
  pretty,
  stringifyConfigValue,
  tableFromRows
} from "./utils";

describe("utils", () => {
  it("compares semantic versions with missing segments treated as zero", () => {
    expect(compareVersions("0.29.0", "0.28.1")).toBeGreaterThan(0);
    expect(compareVersions("0.29", "0.29.0")).toBe(0);
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.9.9", "0.10.0")).toBeLessThan(0);
  });

  it("extracts MagGraph-style nodes and rows from common response envelopes", () => {
    expect(extractNodes({ results: [{ id: "memory:1" }] })).toEqual([{ id: "memory:1" }]);
    expect(extractRows({ plugins: [{ name: "agent-pack" }, "ignored"] })).toEqual([{ name: "agent-pack" }]);
    expect(extractDatabases({ items: [{ key: "main", path: "memory.db" }] })).toEqual([{ key: "main", path: "memory.db" }]);
  });

  it("builds compact table metadata from rows or declared columns", () => {
    expect(tableFromRows([{ a: 1, b: 2 }, { b: 3, c: 4 }])).toEqual({
      columns: ["a", "b", "c"],
      rows: [{ a: 1, b: 2 }, { b: 3, c: 4 }]
    });
    expect(extractTable({ columns: ["name"], rows: [{ name: "one", hidden: true }] })).toEqual({
      columns: ["name"],
      rows: [{ name: "one", hidden: true }]
    });
  });

  it("formats values for config forms and detail panels", () => {
    expect(pretty({ ok: true })).toBe(JSON.stringify({ ok: true }, null, 2));
    expect(stringifyConfigValue(false)).toBe("false");
    expect(encodeFieldValue({ path: "agent.enabled", label: "Enabled", type: "boolean" }, "yes")).toBe("false");
    expect(encodeFieldValue({ path: "agent.turns", label: "Turns", type: "number" }, "4")).toBe("4");
  });

  it("normalizes memory and database display values defensively", () => {
    expect(databaseValue({ key: "project", path: "/tmp/project.db" })).toBe("project");
    expect(getNodeBody({ body: "Remember this" })).toBe("Remember this");
    expect(getNodeBody({ title: "Fallback" })).toContain("Fallback");
    expect(listFromUnknown(["a", 2, true])).toEqual(["a", "2", "true"]);
  });

  it("parses versions from noisy CLI output", () => {
    expect(parseVersion("magent 0.29.0")).toBe("0.29.0");
    expect(parseVersion("not installed")).toBeUndefined();
  });
});
