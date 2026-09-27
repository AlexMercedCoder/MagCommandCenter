import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderSetupPanel } from "./provider-setup-panel";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const SECRET = "sk-test-not-a-real-key-123456";

function ok(stdout: unknown) {
  return {
    ok: true,
    command: "magent",
    stdout: JSON.stringify(stdout),
    stderr: "",
    status: 0,
  };
}

let authConfigured: Array<Record<string, unknown>> = [];
let activeUser = "alex";

beforeEach(() => {
  authConfigured = [];
  activeUser = "alex";
  mockedInvoke.mockReset();
  mockedInvoke.mockImplementation(async (command, args) => {
    const argv = (args as { args?: string[] })?.args ?? [];
    if (command === "run_magent" && argv.join(" ") === "provider detect")
      return ok({
        providers: [
          { id: "ollama", label: "Ollama", default_model: "q", local: true },
          {
            id: "nous-portal",
            label: "Nous Portal",
            default_model: "deepseek/deepseek-v4-flash",
            env_present: false,
            api_key_env: "NOUS_API_KEY",
            local: false,
          },
          { id: "openai", label: "OpenAI", default_model: "gpt", local: false },
        ],
      });
    if (command === "run_magent" && argv.join(" ") === "user current")
      return {
        ok: true,
        command: "magent user current",
        stdout: activeUser || "No active user.",
        stderr: "",
        status: 0,
      };
    if (
      command === "run_magent" &&
      argv[0] === "user" &&
      argv[1] === "create"
    ) {
      activeUser = argv[2];
      return {
        ok: true,
        command: "",
        stdout: "Created",
        stderr: "",
        status: 0,
      };
    }
    if (command === "run_magent" && argv.join(" ") === "auth list")
      return ok({ keyring_available: false, credentials: authConfigured });
    if (command === "magent_auth_add") {
      authConfigured = [
        { provider: "nous-portal", storage: "config", configured: true },
      ];
      return ok({ ok: true, provider: "nous-portal", storage: "config" });
    }
    if (command === "run_magent" && argv[0] === "provider" && argv[1] === "set")
      return ok({ ok: true });
    if (
      command === "run_magent" &&
      argv[0] === "provider" &&
      argv[1] === "test"
    )
      return ok({ ok: true, provider: argv[2], model: "m" });
    return ok({});
  });
});

describe("ProviderSetupPanel", () => {
  it("lists only providers that take a key and defaults to config storage without a keyring", async () => {
    render(<ProviderSetupPanel notify={vi.fn()} />);
    const select = await screen.findByLabelText("Provider");
    expect(
      Array.from((select as HTMLSelectElement).options).map((o) => o.value),
    ).toEqual(["nous-portal", "openai"]);
    expect(
      screen.getByRole("radio", { name: /system keychain/i }),
    ).toBeDisabled();
    expect(screen.getByRole("radio", { name: /config file/i })).toBeChecked();
  });

  it("masks the key, sends it only to the stdin command, and clears it after saving", async () => {
    render(<ProviderSetupPanel notify={vi.fn()} />);
    const input = (await screen.findByLabelText("API key")) as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();

    fireEvent.change(input, { target: { value: SECRET } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));

    await waitFor(() => expect(input.value).toBe(""));
    const authCall = mockedInvoke.mock.calls.find(
      (call) => call[0] === "magent_auth_add",
    );
    expect(authCall?.[1]).toEqual({
      provider: "nous-portal",
      key: SECRET,
      storage: "config",
    });
    // No argv-based command ever carried the key.
    for (const [command, args] of mockedInvoke.mock.calls) {
      if (command === "magent_auth_add") continue;
      expect(JSON.stringify(args ?? {})).not.toContain(SECRET);
    }
    expect(
      mockedInvoke.mock.calls.some(
        (call) =>
          call[0] === "run_magent" &&
          (call[1] as { args: string[] }).args.join(" ") ===
            "provider set nous-portal",
      ),
    ).toBe(true);
    expect(
      await screen.findByRole("option", { name: /Nous Portal \(key saved\)/ }),
    ).toBeInTheDocument();
  });

  it("reveals the key only on request", async () => {
    render(<ProviderSetupPanel notify={vi.fn()} />);
    const input = (await screen.findByLabelText("API key")) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    expect(input.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide key" }));
    expect(input.type).toBe("password");
  });

  it("never tests a provider unless the user clicks Test", async () => {
    render(<ProviderSetupPanel notify={vi.fn()} />);
    await screen.findByLabelText("API key");
    const test = screen.getByRole("button", { name: "Test connection" });
    expect(test).toBeDisabled();
    expect(
      mockedInvoke.mock.calls.some(
        (call) => (call[1] as { args?: string[] })?.args?.[1] === "test",
      ),
    ).toBe(false);

    authConfigured = [
      { provider: "nous-portal", storage: "config", configured: true },
    ];
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: SECRET },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(test).toBeEnabled());
    fireEvent.click(test);
    expect(
      await screen.findByText(/nous-portal answered using m/),
    ).toBeInTheDocument();
  });

  it("starts an offline demo with the mock provider and no key", async () => {
    const onChanged = vi.fn();
    render(<ProviderSetupPanel notify={vi.fn()} onChanged={onChanged} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Start offline demo" }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(
      mockedInvoke.mock.calls.some(
        (call) =>
          call[0] === "run_magent" &&
          (call[1] as { args: string[] }).args.join(" ") ===
            "provider set mock",
      ),
    ).toBe(true);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
      /Offline demo mode is on/,
    );
  });

  it("walks a fresh install through creating a profile before the offline demo", async () => {
    activeUser = "";
    render(<ProviderSetupPanel notify={vi.fn()} />);
    const name = await screen.findByLabelText("Profile name");
    expect(
      screen.getByRole("button", { name: "Start offline demo" }),
    ).toBeDisabled();
    fireEvent.change(name, { target: { value: "../escape" } });
    expect(
      screen.getByRole("button", { name: "Create profile" }),
    ).toBeDisabled();
    fireEvent.change(name, { target: { value: "alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Profile name")).toBeNull(),
    );
    expect(
      mockedInvoke.mock.calls.some(
        (call) =>
          (call[1] as { args?: string[] })?.args?.join(" ") ===
          "user create alex",
      ),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Start offline demo" }),
    ).toBeEnabled();
  });

  it("falls back to config storage when the keychain store fails", async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      const a = args as { args?: string[]; storage?: string };
      const argv = a?.args ?? [];
      if (command === "run_magent" && argv.join(" ") === "provider detect")
        return ok({
          providers: [{ id: "openai", label: "OpenAI", default_model: "g" }],
        });
      if (command === "run_magent" && argv.join(" ") === "auth list")
        return ok({ keyring_available: true, credentials: [] });
      if (command === "run_magent" && argv.join(" ") === "user current")
        return { ok: true, command: "", stdout: "alex", stderr: "", status: 0 };
      if (command === "magent_auth_add" && a.storage === "keyring")
        return {
          ok: false,
          command: "magent auth add",
          stdout: JSON.stringify({ ok: false, error: "No OS keyring" }),
          stderr: "",
          status: 1,
        };
      if (command === "magent_auth_add")
        return ok({ ok: true, storage: "config" });
      return ok({ ok: true });
    });
    render(<ProviderSetupPanel notify={vi.fn()} />);
    const input = await screen.findByLabelText("API key");
    expect(
      screen.getByRole("radio", { name: /system keychain/i }),
    ).toBeChecked();
    fireEvent.change(input, { target: { value: SECRET } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    expect(
      await screen.findByText(/keychain was not available to MagAgent/),
    ).toBeInTheDocument();
    const storages = mockedInvoke.mock.calls
      .filter((call) => call[0] === "magent_auth_add")
      .map((call) => (call[1] as { storage: string }).storage);
    expect(storages).toEqual(["keyring", "config"]);
  });

  it("shows a retryable error when MagAgent cannot list providers", async () => {
    mockedInvoke.mockImplementation(async () => ({
      ok: false,
      command: "magent",
      stdout: "",
      stderr: "magent: command not found",
      status: 127,
    }));
    render(<ProviderSetupPanel notify={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /command not found/,
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});
