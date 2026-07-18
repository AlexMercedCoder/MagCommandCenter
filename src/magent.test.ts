import { describe, expect, it } from "vitest";
import { parseJson, type MagentCommandResult } from "./magent";

function result(stdout: string): MagentCommandResult {
  return { ok: true, command: "magent ask", stdout, stderr: "", status: 0 };
}

describe("magent bridge helpers", () => {
  it("parses pure JSON command output", () => {
    expect(parseJson<{ ok: boolean }>(result('{"ok":true}'))).toEqual({ ok: true });
  });

  it("parses the trailing JSON object from mixed streamed output", () => {
    const parsed = parseJson<{ response: string }>(
      result('thinking...\nstdout: tool started\n{"ok":true,"response":"done"}\n')
    );

    expect(parsed?.response).toBe("done");
  });
});
