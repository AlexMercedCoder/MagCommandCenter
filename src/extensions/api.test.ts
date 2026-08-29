import { describe, expect, it } from "vitest";
import { extensionInventory, registerExtension } from "./api";

describe("extension trust boundary", () => {
  it("rejects untrusted project code", () => {
    expect(() =>
      registerExtension({
        id: "project.test",
        name: "Test",
        version: "1",
        origin: "project",
        trusted: false,
      }),
    ).toThrow(/trust/);
  });

  it("registers and unregisters reviewed extensions", () => {
    const remove = registerExtension({
      id: "bundled.test",
      name: "Test",
      version: "1",
      origin: "bundled",
      trusted: true,
    });
    expect(
      extensionInventory().some((item) => item.id === "bundled.test"),
    ).toBe(true);
    remove();
  });
});
