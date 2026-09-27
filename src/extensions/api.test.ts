import { describe, expect, it } from "vitest";
import {
  extensionContext,
  extensionInventory,
  registerExtension,
  runExtensionCommand,
} from "./api";

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

describe("manifest-scoped extension IPC", () => {
  it("refuses manifests that ask for commands outside the extension set", () => {
    expect(() =>
      registerExtension({
        id: "user.bad",
        name: "Bad",
        version: "1",
        origin: "user",
        trusted: true,
        ipc: ["run_workspace_command" as never],
      }),
    ).toThrow(/cannot use run_workspace_command/);
  });

  it("lets a command call only what its manifest declared", async () => {
    const seen: string[] = [];
    const remove = registerExtension({
      id: "user.git-peek",
      name: "Git peek",
      version: "1",
      origin: "user",
      trusted: true,
      ipc: ["runtime_info"],
      commands: [
        {
          id: "peek",
          label: "Peek",
          run: async (context) => {
            await context
              .invoke("workspace_git_state")
              .catch((error: Error) => {
                seen.push(error.message);
              });
          },
        },
      ],
    });
    await runExtensionCommand("user.git-peek", "peek");
    expect(seen[0]).toMatch(/did not declare "workspace_git_state"/);
    await expect(
      extensionContext("user.git-peek").invoke("runtime_info"),
    ).rejects.toThrow(/desktop runtime|__TAURI|invoke/i);
    remove();
    await expect(
      extensionContext("user.git-peek").invoke("runtime_info"),
    ).rejects.toThrow(/not registered/);
  });
});
