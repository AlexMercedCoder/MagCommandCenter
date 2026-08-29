import { describe, expect, it } from "vitest";
import { parseArgv } from "./workspace-client";

describe("safe command argument parsing", () => {
  it("groups quoted arguments without interpreting a shell", () => {
    expect(parseArgv('git commit -m "release candidate"')).toEqual([
      "git",
      "commit",
      "-m",
      "release candidate",
    ]);
    expect(parseArgv("printf 'hello world'")).toEqual([
      "printf",
      "hello world",
    ]);
  });

  it("keeps shell operators inert arguments", () => {
    expect(parseArgv("echo ok | tee result")).toEqual([
      "echo",
      "ok",
      "|",
      "tee",
      "result",
    ]);
  });

  it("rejects unfinished quoting", () => {
    expect(() => parseArgv("git commit -m 'unfinished")).toThrow(/unfinished/);
  });
});
