import { describe, expect, it } from "vitest";
import { normalizeSessions, summarizeOrchestratedGoal, withPagination } from "./workspace";

describe("workspace domain helpers", () => {
  it("migrates legacy string sessions and rejects malformed entries", () => {
    const sessions = normalizeSessions(["one", { id: "two", name: "Second" }, null, {}]);
    expect(sessions.map((item) => item.id)).toEqual(["one", "two"]);
    expect(sessions[1].name).toBe("Second");
  });

  it("provides a default session for missing state", () => {
    expect(normalizeSessions(null)[0].id).toBe("default");
    expect(normalizeSessions([])[0].id).toBe("default");
  });

  it("preserves pinned OAP identity while normalizing sessions", () => {
    const session = normalizeSessions([{ id: "one", name: "One", agentProfile: "reviewer", profileDigest: "sha256:abc" }])[0];
    expect(session.agentProfile).toBe("reviewer");
    expect(session.profileDigest).toBe("sha256:abc");
  });

  it("adds bounded pagination without overriding an explicit limit", () => {
    expect(withPagination("select * from tasks;", 2)).toBe("select * from tasks limit 100 offset 200");
    expect(withPagination("select * from tasks limit 5", 3)).toBe("select * from tasks limit 5");
  });

  it("summarizes cached orchestrated goals with runnable commands", () => {
    const summary = summarizeOrchestratedGoal({ plan: { id: "plan_1" }, orchestration: { cache_key: "abc", steps: [{}, {}] } });
    expect(summary).toContain("plan_1");
    expect(summary).toContain("2 staged steps");
    expect(summary).toContain("goal-run plan_1 --dry-run");
  });
});
