import { describe, expect, it } from "vitest";
import { sentenceCase } from "./text";

describe("sentenceCase", () => {
  it("capitalizes only the first word and spaces identifiers", () => {
    expect(sentenceCase("awaiting_human")).toBe("Awaiting human");
    expect(sentenceCase("needs review")).toBe("Needs review");
    expect(sentenceCase("")).toBe("");
  });
});
