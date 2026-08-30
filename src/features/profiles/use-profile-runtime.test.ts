import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { magentClient } from "../../magent";
import { useProfileRuntime } from "./use-profile-runtime";

vi.mock("../../magent", () => ({
  magentClient: {
    generateProfileDraft: vi.fn(),
  },
}));

const generateProfileDraft = vi.mocked(magentClient.generateProfileDraft);

describe("useProfileRuntime profile generation", () => {
  beforeEach(() => generateProfileDraft.mockReset());

  it("stores a generated preview and forwards the complete authoring request", async () => {
    const preview = { document: { metadata: { name: "reviewer" } } } as never;
    generateProfileDraft.mockResolvedValue(preview);
    const { result } = renderHook(() => useProfileRuntime("/repo", false));

    await act(async () => {
      await expect(
        result.current.generateDocument(
          "Review pull requests",
          "reviewer",
          "docs",
        ),
      ).resolves.toBe(preview);
    });

    expect(generateProfileDraft).toHaveBeenCalledWith(
      "Review pull requests",
      "/repo",
      "reviewer",
      "docs",
    );
    expect(result.current.preview).toBe(preview);
    expect(result.current.error).toBe("");
    expect(result.current.busy).toBe(false);
  });
});
