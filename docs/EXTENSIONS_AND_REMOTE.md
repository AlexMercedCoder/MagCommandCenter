# Extensions and remote runtimes

Both features in this document are **experimental** in 1.0. They work as described, but
they are outside the 1.0 stability promise and may change or be removed in a minor
release. Settings > **Experimental features** lists them.

## Extension API (experimental)

Bundled code can call `window.MagCommandCenter.registerExtension(manifest)`. A manifest may contribute commands, inspectors, and navigation targets. IDs must use lowercase letters, digits, dots, underscores, or hyphens and be 2–80 characters. User and project extensions must set `trusted: true` only after the user has reviewed their source and authority.

Extensions execute in the renderer process and are not a sandbox. The trust check prevents accidental activation; it does not make untrusted JavaScript safe. Distribute extension source with an integrity digest, keep permissions narrow, and prefer MagAgent plugins/skills for capabilities that do not need UI rendering.

```ts
const dispose = window.MagCommandCenter?.registerExtension({
  id: "example.release-tools",
  name: "Release tools",
  version: "1.0.0",
  origin: "user",
  trusted: true,
  commands: [
    { id: "check", label: "Run release check", run: () => runCheck() },
  ],
});
```

Call the returned function to unregister the extension.

### Native commands (manifest-scoped IPC)

An extension that needs data from the desktop runtime lists the commands in `ipc`. Only
these read-only commands can be listed: `runtime_info`, `approval_snapshot`,
`inspect_project`, `list_workspace_files`, `preview_workspace_file`,
`workspace_git_state`, and `workspace_git_diff`. Registration fails for anything else.
Each command's `run` receives a context whose `invoke` rejects commands the manifest did
not declare:

```ts
window.MagCommandCenter?.registerExtension({
  id: "user.branch-peek",
  name: "Branch peek",
  version: "1.0.0",
  origin: "user",
  trusted: true,
  ipc: ["workspace_git_state"],
  commands: [
    {
      id: "peek",
      label: "Show branch",
      run: async ({ invoke }) => {
        const git = await invoke("workspace_git_state", { project: "/path" });
        console.log(git);
      },
    },
  ],
});
```

Run a command with `window.MagCommandCenter.run(extensionId, commandId)`. This scopes the
supported API; it is not a sandbox, because extension code runs in the renderer.

## Remote runtime (experimental, off by default)

The remote runtime drives MagAgent on another machine through MagAgent 1.4's
`magent serve --rpc` gateway (protocol `magent.rpc.v1`, also experimental). Both sides may
change in a minor release. The connection form is hidden on a default install: open
Settings > **Experimental features** and turn on **Remote runtime**. Turning it off drops
any active connection and returns to the native runtime.

### Start a gateway

On the machine that should run the agent:

```bash
magent serve --rpc --root ~/code/my-project     # prints url and a one-time token
```

It listens on `127.0.0.1:7850`. For another machine, keep it on loopback and put an HTTPS
reverse proxy in front of it (MagAgent's `magent docs show rpc-gateway` has Caddy and nginx
examples). Command Center accepts plain HTTP only for loopback endpoints.

### Connect

Enter the endpoint (for example `https://agent.example.com/rpc`) and the token, then
**Connect and verify**. The first connection to a host opens a native dialog naming it.
Command Center checks that the endpoint answers `runtime_info` with protocol
`magent.rpc.v1` and shows the MagAgent version and allowed project roots.

- The token lives in the native runtime's memory. Tick **Remember the token in the system
  keychain** to store it in the OS credential store (macOS Keychain, Windows Credential
  Manager, or the Secret Service on Linux), keyed by host; it is never written to app
  state or localStorage. Next time, **Connect with saved token** skips the paste and the
  host dialog, and **Forget saved token** removes it.
- Only the endpoint URL is remembered in localStorage.

### What works remotely

- Chat asks, staged goals, and graph runs stream over the gateway: Rust starts them with
  `stream.start` and long-polls `stream.events` (20-second waits), relaying each line on
  the same event the native runtime uses. So the transcript, activity, AAIS approval
  dialog, tray count, and notifications behave as they do locally.
- Approval decisions go back with `write_magent_stream`; **Stop** calls
  `cancel_magent_stream`, which stops the run's whole process group on the gateway host.
- If the gateway reports a gap (its buffer keeps the last 5,000 lines), the transcript
  says so and continues from the oldest line still available. Five failed polls in a row
  end the run in Command Center with a message; the run may still finish on the gateway.
- Setup's **Detect MagAgent** runs `magent --version` on the gateway. Installing or
  upgrading MagAgent has to happen on the gateway host.
- Quitting Command Center asks the gateway to cancel the runs it started
  (`cancel_magent_stream` for each, in parallel, about two seconds at most). This is best
  effort: a crash or a lost connection skips it, and the runs then finish on the gateway.

### What still needs the native runtime

Views that read this computer's files or processes (Files and Git, the console, project
health, artifact previews, SQLite browsing, diagnostics bundles) call native commands the
gateway does not provide; they show "This view needs the native desktop runtime".

Provider keys are never sent to a gateway. While remote mode is connected, **Save key**
is refused with a message; run `magent auth add` on the gateway host instead. Before
SEC-1 the key was forwarded to the gateway as request parameters.

### Gateway contract

`POST /rpc` with `Authorization: Bearer <token>`, one JSON-RPC 2.0 request per call.
JSON-RPC errors arrive as HTTP 200 with `error.code` and `error.message`; a bad token is
HTTP 401. Command Center uses `runtime_info`, `run_magent`, `run_magent_input`,
`stream.start`, `stream.events`, `write_magent_stream`, and `cancel_magent_stream`, and
turns error codes into guidance (for example `-32003` forbidden commands or project paths
outside the gateway's roots, `-32001` a rejected token). Requests carry no cookies, do not
follow redirects, time out after 30 seconds (45 for long polls), and refuse responses over
8 MiB. MagAgent's recorded exchanges (`tests/fixtures/rpc_gateway/lifecycle.json`) are
replayed in Command Center's tests from `src-tauri/tests/fixtures/rpc-gateway-lifecycle.json`.
