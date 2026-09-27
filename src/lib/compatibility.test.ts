import { describe, expect, it } from "vitest";
import { magentCompatibility, MEMORY_EVIDENCE_CONTRACT } from "./compatibility";
import type { SystemInfo } from "./types";

const base = {
  desktop_cli: { version: "1" },
  task: { version: "magent.task.v2" },
  task_event: { version: "magent.task-event.v1" },
  memory_recall: { version: "2" },
};

function system(version: string, extra = {}): SystemInfo {
  return {
    magent_version: version,
    contracts: { ...base, ...extra },
  } as SystemInfo;
}

describe("magentCompatibility", () => {
  it("accepts MagAgent 1.4.0 and newer", () => {
    expect(magentCompatibility(system("1.4.0")).ok).toBe(true);
    expect(magentCompatibility(system("1.5.2")).ok).toBe(true);
  });

  it("rejects 1.3.x unless it advertises the 1.4 memory-evidence contract", () => {
    expect(magentCompatibility(system("1.3.0")).ok).toBe(false);
    const dev = magentCompatibility(
      system("1.3.0", {
        memory_evidence: { version: MEMORY_EVIDENCE_CONTRACT },
      }),
    );
    expect(dev).toEqual({ ok: true, contractsOk: true, viaContracts: true });
  });

  it("never accepts older releases or missing contracts", () => {
    expect(
      magentCompatibility(
        system("1.2.0", {
          memory_evidence: { version: MEMORY_EVIDENCE_CONTRACT },
        }),
      ).ok,
    ).toBe(false);
    expect(
      magentCompatibility({ magent_version: "1.4.0" } as SystemInfo).ok,
    ).toBe(false);
    expect(magentCompatibility(null).ok).toBe(false);
  });
});
