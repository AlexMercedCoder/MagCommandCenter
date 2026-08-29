import { describe, expect, it } from "vitest";
import { performanceReport, recordPerformance } from "./performance";

describe("local performance budgets", () => {
  it("records passing and failing measurements without telemetry", () => {
    const passing = recordPerformance("project.switch", 100, 500);
    const failing = recordPerformance("project.switch", 100, 1000);
    expect(passing.ok).toBe(true);
    expect(failing.ok).toBe(false);
    expect(performanceReport().schema).toBe(
      "mag-command-center.performance.v1",
    );
    expect(performanceReport().measurements[0]).toEqual(failing);
  });
});
