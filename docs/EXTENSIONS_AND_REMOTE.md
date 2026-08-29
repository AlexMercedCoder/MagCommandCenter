# Extensions and remote runtimes

## Extension API

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

## Remote runtime contract

Settings can switch the desktop bridge to a remote JSON-RPC 2.0 endpoint. The client sends the native command name as `method` and its argument object as `params`, with a random request ID. The endpoint must return either `result` or a standard `error.message` object.

Requirements:

- HTTPS is mandatory except for `localhost`, `127.0.0.1`, or `::1` development endpoints.
- The bearer token is held only in memory and cleared from the settings field after connection.
- Requests omit cookies, disable caches, reject redirects, and time out after 30 seconds.
- The gateway must authenticate every request, authorize commands and project roots server-side, bound request/output sizes, keep an audit trail, and apply rate limits.

The app stores only the endpoint. Restarting always requires a new token. Streaming commands degrade to a bounded final-result event in remote mode unless the gateway implements an equivalent event channel. Switching back to **Use native** immediately drops the remote transport reference.
