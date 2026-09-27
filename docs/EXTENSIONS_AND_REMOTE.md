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

No MagAgent release ships a JSON-RPC gateway yet, so remote mode has nothing to connect
to unless you operate a gateway that implements the contract below. For that reason the
connection form is hidden on a default install. To see it, open Settings > **Experimental
features** and turn on **Remote runtime**. Turning the toggle off again drops any active
remote connection and returns to the native runtime.

### What works in remote mode

Only request/response commands. Streaming commands (chat asks, graph runs, anything that
shows live output) are **refused** in remote mode with the error "Remote streaming and
approvals are not negotiated. Use the native desktop runtime for this operation." They do
not fall back to a final-result mode, and because no stream starts, AAIS approvals and
Stop are unavailable too. Switch back to **Use native** for those.

### Contract

Settings can switch the desktop bridge to a remote JSON-RPC 2.0 endpoint. Connecting
opens a native dialog that names the host; after that, the native runtime (not the
renderer) sends each call as `method` (the native command name) and `params` (its
arguments) with a request ID and the bearer token. The endpoint must return either
`result` or a standard `error.message` object.

Requirements:

- HTTPS is mandatory except for `localhost`, `127.0.0.1`, or `::1` development endpoints.
- The bearer token is held only in the native runtime's memory; the renderer clears its field after connecting.
- Requests carry no cookies, do not follow redirects, time out after 30 seconds, and responses over 8 MiB are refused.
- The gateway must authenticate every request, authorize commands and project roots server-side, bound request/output sizes, keep an audit trail, and apply rate limits.

The app stores only the endpoint. Restarting always requires a new token and always
starts on the native runtime. Switching back to **Use native** immediately drops the
remote transport reference.

A real remote mode, with an event channel for streaming and approvals, is planned against
a MagAgent `serve --rpc` gateway after 1.0.
