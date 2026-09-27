# Threat model

**This is a self-review, not an independent audit.** It was written by the same agent
that built most of the surfaces it covers (SEC-1, 2026-09-27, branch
`claude/next-release`), so it shares that author's blind spots. Treat it as a map of
what was checked and what is known to remain, not as assurance. An external review
before 1.0 is still recommended.

References name the file and function rather than line numbers, which drift. "Tests"
lists the tests that cover a mitigation. Rust tests live next to the code
(`cargo test --lib <name>`), and renderer tests are `*.test.ts(x)` files under `src/`.

## System and trust boundaries

Command Center is a Tauri 2 desktop app. It has three parts:

- A React renderer loaded from the app bundle.
- A Rust core that owns every process, file, network, and keychain operation.
- Agent CLIs driven as child processes: MagAgent (`magent`), and Loro (experimental).

The trust boundaries are:

1. **Renderer to Rust (IPC).** The renderer is trusted less than the core. It renders
   agent and gateway output, so the core validates every argument itself. Script
   execution in the renderer is limited by the CSP (`script-src 'self'`) and by the
   renderer having no raw-HTML sinks (see Diff viewer and Content security policy). Custom Tauri commands are
   available to the main window. Capability files gate only plugin permissions:
   `core:default`, `dialog:allow-open`, and two notification permission checks.
2. **Rust to agent processes.** Agent stdout is untrusted. Only validated AAIS
   envelopes affect approval state.
3. **Project folders.** Content in a project, including `.git/config`, can be written by
   the agent working in it, so it is untrusted input to anything Command Center runs
   there.
4. **Network.** The core talks to three kinds of destination:
   - a user-confirmed remote gateway (experimental);
   - GitHub for uv downloads (managed install);
   - the Tauri updater endpoint (only when a build carries an updater key).

   The renderer itself has no network access (`connect-src` is IPC only).

Main assets:

- Provider API keys and the remote gateway token.
- Integrity of the user's files and projects.
- The approval decision, meaning only the user approves agent actions.
- Local code execution, meaning no program runs that the user did not choose.
- Availability of the app.

## Summary of SEC-1 findings

Fixed in this review, each with a regression test. The tests for findings 1 to 6, 8 to
10, and 12 were run against the old code and failed there. The tests for 7 (pinned
digest) and 11 (folder mode) use the new code's interfaces, so they were written with
the fix and not run against the old code.

| #   | Severity                                       | Finding                                                                                                                                                                                                                                                                                                                                        | Fix                                                      |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | High                                           | Git views, project inspection, and console Git ran programs named in the project's own `.git/config`: `core.fsmonitor` on `status`, `diff.external`/textconv on `diff`/`log`, filter drivers on `add`, hooks on `worktree add`, and `gpg.program`. An agent that edits `.git/config` could get code run by Command Center without an approval. | `git_guard.rs`                                           |
| 2   | High                                           | With the remote runtime connected, **Save key** sent the provider API key to the gateway host as JSON-RPC parameters, because `storeProviderKey` used the transport-routed `desktopInvoke`.                                                                                                                                                    | `providers.ts` refuses in remote mode                    |
| 3   | High (needs a compromised renderer)            | Uploads write renderer-chosen bytes under `<project>/.magent/attachments/…`, and any folder could be passed as a console workspace. An uploaded `package.json` or `Makefile` then ran via the no-dialog allowlist (`npm test`, `make test`).                                                                                                   | `workspace.rs` `root()` refuses folders inside `.magent` |
| 4   | Medium                                         | The editor handoff's system opener (`xdg-open`, `open`, `explorer.exe`) runs `.desktop`, `.command`, `.bat`, `.lnk`, executables, and so on. "Open in editor" on an agent-written file could therefore launch it.                                                                                                                              | `editor.rs` `launchable`                                 |
| 5   | Medium                                         | A second stream (a Loro run or a remote gateway) could replace another stream's pending approval by reusing its request id, and one stream could add unlimited pending requests.                                                                                                                                                               | `approval_state.rs` ownership check, 32 per stream       |
| 6   | Medium                                         | The remote client checked `Content-Length` but buffered chunked bodies without limit (memory exhaustion from a hostile gateway).                                                                                                                                                                                                               | `remote.rs` `call_with` reads chunk by chunk             |
| 7   | Medium                                         | The managed install trusted uv's `.sha256` file from the same release as the archive.                                                                                                                                                                                                                                                          | Digests pinned in source (`pinned_uv_sha256`)            |
| 8   | Medium (needs a compromised renderer or a bug) | Native `run_magent*` passed MagAgent profile names through unchecked. MagAgent joins them onto its config folder, so `user delete ../.. --yes` would remove a folder outside it. The only check was renderer form validation.                                                                                                                  | `lib.rs` `magent_args_policy`                            |
| 9   | Low                                            | OS notification bodies carried agent-supplied text unescaped. Linux notification servers render markup (links, bold) in the body.                                                                                                                                                                                                              | `presence.rs` `approval_notification_body`               |
| 10  | Low                                            | uv extraction staged through a fixed `uv.partial` path with `fs::write`, which follows a planted symlink.                                                                                                                                                                                                                                      | `create_new` staging file, then rename                   |
| 11  | Low                                            | The managed-install folder used the default umask.                                                                                                                                                                                                                                                                                             | Created owner-only (0700)                                |
| 12  | Low (functional, found here)                   | Uploading into a new chat session's attachment folder failed ("No such file or directory").                                                                                                                                                                                                                                                    | Folder created first, symlinked components refused       |

Hardening without a behavior-level failing test:

- Artifact and preview reads are bounded while reading, not only by an earlier size
  check.
- Zip symlink entries are skipped when extracting uv on Windows.

New behavior from the same package (F-1): quitting the app asks the remote gateway to
cancel the remote runs this app started. Previously they kept running on the gateway
host.

## Surfaces

### Tauri commands (IPC)

**Assets:**

- Local code execution.
- Files outside the chosen project.
- The approval decision.
- Secrets.

**STRIDE:**

- **Tampering and elevation.** A compromised renderer calls commands with hostile
  arguments.
- **Information disclosure.** Paths escape the project.
- **Denial of service.** Oversized inputs.

**Mitigations.** Commands that can reach process spawning:

| Command                                                          | Spawns                       | Validation                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run_magent`, `run_magent_input`, `run_magent_stream` (`lib.rs`) | `magent`                     | `magent_args_policy` (profile names, no `user delete`); stdin capped at 2 MiB; argv only, never a shell                                                                                                                              |
| `run_harness_stream`, `harness_detect` (`harness.rs`)            | `magent` / `loro`            | Harness name from a closed set; `cwd` canonicalized; prompt in an owner-only temp file (`write_prompt_file`, 2 MiB cap)                                                                                                              |
| `magent_auth_add` (`provider_keys.rs`)                           | `magent auth add`            | Provider id pattern; storage ∈ {keyring, config}; key on stdin, single line, ≤ 4 KiB; output scrubbed                                                                                                                                |
| `run_setup_command` (`lib.rs`)                                   | `magent`, `pipx`, `python3`  | Exact allowlist (`is_allowed_setup_command`)                                                                                                                                                                                         |
| `run_workspace_command` (`workspace.rs`)                         | Any program                  | `command_policy::classify`. The no-dialog allowlist covers read-only Git and common test/build entry points. Anything else needs a native dialog, remembered per project in a table the renderer cannot write. Git gets `git_guard`. |
| `workspace_git_*`, `workspace_*_worktree`, `inspect_project`     | `git`                        | `git_guard::command`; paths confined; branch names validated (`safe_branch`)                                                                                                                                                         |
| `open_in_editor` (`editor.rs`)                                   | Editor or system opener      | Editor from a closed set; file must canonicalize inside the project; terminal editors from `$EDITOR` refused; launchable files never reach the system opener                                                                         |
| `managed_install_*` (`managed_install.rs`)                       | `uv`, the installed `magent` | No renderer arguments; see Managed install                                                                                                                                                                                           |
| `write_magent_stream`                                            | Writes to agent stdin        | Must be a valid AAIS `approval.decided` envelope, ≤ 2 MiB                                                                                                                                                                            |

**Path handling.**

- `workspace.rs` `root` canonicalizes the project and refuses folders inside `.magent`.
- `confined` canonicalizes each candidate and requires it to stay under the root. It
  hides `.magent` except attachments.
- `read_project_artifact` and `editor::confined_file` apply the same rule.
- Uploads keep only the file name and a sanitized session id, and refuse symlinked
  folders and targets.
- Worktrees must stay beside the project.

**Residual risk:**

- **The project root is whatever folder the renderer names.** Confinement protects
  paths _within_ a root; it does not stop a compromised renderer from choosing a
  different root, such as the home folder.
- **The allowlisted console commands run project code by design.** `npm test` runs
  `package.json` scripts and `cargo test` runs `build.rs`. They are meant for the
  user's own projects.
- **A compromised renderer can start agent runs with any permission mode.** This
  includes MagAgent's `yolo`. The arguments of `run_magent` beyond profile names, and
  those of `run_harness_stream`, are not allowlisted. The defenses are the CSP and the
  absence of HTML sinks, not argument policy.
- **Canonicalize-then-open races remain.** A local process that can swap a path for a
  symlink between the check and the read could redirect a single read or write inside
  the user's own account.
- **`save_app_state` accepts values of any size** from the renderer.

**Tests:**

- `workspace::tests::git_views_do_not_run_programs_from_repository_config`
- `uploads_cannot_become_a_workspace_that_runs_allowlisted_commands`
- `branch_validation_rejects_ambiguous_names`
- `timeout_stops_background_processes_that_hold_the_output_pipe`
- `command_policy` tests
- `tests::magent_user_names_are_validated_natively`
- `setup_command_allowlist_accepts_only_bootstrap_commands`
- `harness::tests::*`
- `provider_keys::tests::*`
- `editor::tests::*`

### Git inside projects

**Assets:** local code execution.

**STRIDE:** elevation, through programs named in repository config (finding 1).

**Mitigations.** `git_guard.rs` runs every Git process as follows:

- **Command-line overrides.** `-c core.fsmonitor=false`, `core.hooksPath=/dev/null`
  (`NUL` on Windows), `diff.external=`, `log.showSignature=false`, `core.pager=cat`,
  `diff.ignoreSubmodules=all`, and `submodule.recurse=false`. Command-line config
  outranks every config file and is inherited by nested Git processes.
- **Repository filter drivers blanked.** Filters defined in the repository's own
  config, including included files, are blanked and marked not required.
- **Helper flags.** `--no-ext-diff --no-textconv` are added for `diff`, `log`, and
  `show`, and `--no-textconv` for `blame`.
- **No user `-c`.** The console policy already refuses user-supplied `-c`,
  `--exec-path`, and `--config-env`, so the overrides cannot be undone.

**Residual risk:**

- Filter drivers from the user's global or system config (for example Git LFS) stay
  active, because they are the user's choice.
- Submodule changes are not shown in the Git views.
- Approved non-Git console commands are not guarded.
- Git settings not listed above that only matter for network operations (credential
  helpers, `core.sshCommand`) are not overridden. Command Center runs no fetch or push.

**Tests:**

- `git_views_do_not_run_programs_from_repository_config`, which exercises state, both
  diffs, stage, worktree add, project inspection, and a console `git log -p` against a
  repository configured with all of these hooks.
- `git_guard::tests::helpers_are_disabled_for_diff_producing_commands`.

### Editor handoff

**Assets:** local code execution; files outside the project.

**STRIDE:**

- **Tampering and elevation.** Argument injection into editor command lines, file
  paths starting with `-`, symlinks leaving the project, and the system opener running
  a file.

**Mitigations (`editor.rs`):**

- The renderer sends only an editor _name_ from a closed set, a project, a path, and a
  line number.
- `confined_file` canonicalizes the path (resolving symlinks) and requires an existing
  regular file inside the project.
- The argument passed on is therefore an absolute path. It can never start with `-`
  and cannot be read as an option.
- Arguments are passed as argv, not through a shell, and the editor process gets null
  stdio.
- `$VISUAL`/`$EDITOR` is read natively, and terminal editors are refused.
- `launchable` keeps scripts, launchers, installers, and (on Unix) files with an
  execute bit away from `xdg-open`, `open`, and `explorer.exe`. Code editors still
  open them as text.

**Residual risk:**

- `$VISUAL`/`$EDITOR` is split on whitespace, so an editor path containing spaces does
  not work (this fails safe).
- On Windows, `code` resolves to `code.cmd`. Rust escapes batch-file arguments (fixed
  in Rust 1.77.2), and paths are canonical.
- The Windows paths are compiled but not run on Windows in this review.

**Tests:**

- `editor::tests::editors_open_at_the_line`
- `environment_editor_rejects_terminal_editors`
- `only_files_inside_the_project_open`
- `the_system_opener_refuses_files_it_would_run`

### Diff viewer

**Assets:** renderer integrity; the approval decision.

**STRIDE:**

- **Tampering.** Untrusted file content and file names from `git diff` or MagAgent
  checkpoints.

**Mitigations:**

- `src/lib/diff.ts` parses diffs into data.
- `src/components/diff-review.tsx` renders every line and path as React text nodes.
  There is no `dangerouslySetInnerHTML` and no HTML parsing.
- Git diff output is bounded to 256 KiB (`workspace.rs` `read_bounded`).
- "Open in editor" paths taken from a diff go through `open_in_editor` confinement, so
  `a/../../etc/passwd` or an absolute checkpoint path outside the project is refused
  natively.

**Residual risk:**

- Very long lines are wrapped, not truncated.
- Checkpoint diffs are as large as MagAgent returns.

**Tests:** `src/lib/diff.test.ts`, `src/components/diff-review.test.tsx`.

### Remote mode (experimental)

**Assets:**

- The gateway token.
- The provider keys.
- The approval decision.
- Availability.

**STRIDE:**

- **Spoofing.** A wrong host.
- **Information disclosure.** The token over plain HTTP, or a key sent to the gateway
  (finding 2).
- **Tampering.** Hostile output rendered in the UI.
- **Denial of service.** Unbounded responses (finding 6).

**Mitigations (`remote.rs`):**

- **Endpoint rules.** `validate_endpoint` allows HTTPS anywhere and plain HTTP only on
  `localhost`, `127.0.0.1`, or `::1`. Credentials embedded in the URL are refused.
- **Host confirmation.** The first connection to a host needs a native confirmation
  dialog.
- **Token storage.** The token is held in native memory and, only if the user ticks
  Remember, in the OS credential store under the gateway origin. It is never in app
  state, localStorage, or diagnostics, and it is sent only to that origin.
- **HTTP client limits.** Redirects are off. Requests time out after 30 s, or
  20 s + 15 s for long polls. Responses are capped at 8 MiB _while reading_.
- **Stream output.** Remote stream lines go through the same AAIS validation as local
  ones.
- **Rendering.** Gateway text (command strings, stdout, stderr, error messages) is
  rendered as React text in `<pre>`/text nodes. There is no markdown or ANSI
  interpretation, so no HTML sink exists.
- **Protocol.** The protocol is JSON long-polling (`stream.events`), not SSE. The
  per-page limit is the 8 MiB response cap, and the stream gives up after 5
  consecutive failures.
- **Provider keys.** `providers.ts` refuses to store a provider key while remote mode
  is connected.
- **App close (F-1).** Quitting sends `cancel_magent_stream` for each active remote
  run, concurrently, each bounded by 2 s.

**Residual risk:**

- The gateway is trusted to run what it is asked. `remote_runtime_request` forwards any
  method name to it, and the gateway enforces its own policy.
- There is no certificate pinning. The system trust store decides.
- `localhost` relies on the hosts file.
- A hostile gateway can show misleading approval requests, but decisions go back only
  to that gateway.
- The exit cancel is best effort. A crash or power loss skips it.

**Tests:**

- `remote::tests::endpoints_need_https_except_on_loopback`
- `tokens_are_bounded_single_line`
- the replay of MagAgent's `rpc_gateway/lifecycle.json`
- `chunked_responses_are_capped_while_reading`
- `closing_the_app_cancels_the_remote_runs_it_started`
- `exit_cancel_does_not_hang_on_an_unresponsive_gateway`
- `src/lib/remote-mode.test.ts` ("never sends a provider key to the remote gateway")
- opt-in `talks_to_a_real_gateway`

### Loro adapter (experimental)

**Assets:** the approval decision; renderer integrity.

**STRIDE:** tampering, through untrusted JSON on stdout.

**Mitigations:**

- `src/harness/loro-adapter.ts` parses only the final JSON line with `parseJson` and
  reads `response` only if it is a string.
- Everything is rendered as text.
- AAIS lines are validated by `approval_state::capture` like MagAgent's.
- A Loro stream cannot take over another stream's pending request (finding 5).
- Prompts go through an owner-only temp file, not argv, and the file is deleted after
  the run.

**Residual risk:** the Loro binary is found via `LORO_BIN` or common user locations,
so whoever controls those controls the harness.

**Tests:**

- `src/harness/harness.test.ts`
- `harness::tests::prompts_go_in_an_owner_only_file_not_argv`
- opt-in `runs_a_real_loro_with_the_prompt_in_a_file`
- `approval_state::tests::pending_requests_belong_to_their_stream_and_are_bounded`

### Approvals (AAIS)

**Assets:** the approval decision.

**STRIDE:**

- **Spoofing and tampering.** Forged requests or resolutions.
- **Denial of service.** Flooding.

**Mitigations (`approval_state.rs`):**

- Only envelopes that pass `agent_approval_interchange::validate` count.
- A resolution must come from the stream that owns the request and match its action
  digest.
- Request ids are owned by the first stream to raise them.
- Each stream may hold at most 32 pending requests, and history is capped at 100.
- Decisions written back must be `approval.decided` envelopes.
- Escape dismisses the dialog and Deny is an explicit button (D9). A dismissal is not
  an approval.

**Residual risk:** the agent defines the action summary the user reads, so a malicious
agent can describe an action misleadingly. The digest still binds the decision to the
exact action.

**Tests:** `approval_state::tests::*` (6), `src/components/approval-center.test.tsx`.

### Extensions (experimental)

**Assets:** IPC reach.

**STRIDE:** elevation, through bypassing the manifest-scoped IPC.

**Mitigations:**

- `src/extensions/api.ts` lets an extension's `invoke` reach only the read-only
  commands it declared, from `EXTENSION_IPC_COMMANDS`.
- User and project extensions must be registered with `trusted: true`.

**Residual risk, stated plainly: the scoping is a guard against mistakes, not a
security boundary.**

- Extensions run in the renderer's own JavaScript realm, so extension code can call
  `window.__TAURI_INTERNALS__.invoke` directly and reach every command.
- `trusted` is declared by the caller, not granted by the user.
- No extension loader exists. Only bundled scripts can call `registerExtension`,
  because the CSP allows scripts from the app bundle only.
- A real third-party extension story would need an isolated realm (a sandboxed iframe
  with a message bridge) and a native trust grant. That is not built.

**Tests:** `src/extensions/api.test.ts`.

### Managed install (experimental)

**Assets:** local code execution (the downloaded uv and the installed packages).

**STRIDE:**

- **Tampering.** A substituted archive (finding 7), TOCTOU, zip-slip, and symlinks
  (finding 10).
- **Elevation.** Folder permissions (finding 11).

**Mitigations (`managed_install.rs`):**

- **Download.** The uv 0.6.14 archive is downloaded only from
  `https://github.com/astral-sh/uv/releases/download/0.6.14/…`. `fetch` refuses any
  other URL and plain HTTP, and caps the size at 64 MiB.
- **Verification.** The archive is verified _in memory_ against the per-platform
  SHA-256 pinned in `pinned_uv_sha256` before anything is written. Nothing is
  re-read from disk between check and use.
- **Extraction.** Only the entry whose file name is `uv`/`uv.exe` is extracted, from
  bytes. Archive paths are ignored, so there is no zip-slip. Tar entries must be
  regular files, and zip symlink entries are skipped.
- **Staging.** The binary is written to a fresh `create_new` file and renamed into
  place.
- **Permissions.** The install folder is set to 0700.
- **uv isolation.** uv runs with `--no-config`, private cache and Python folders, and
  index-URL variables removed.
- **Commit point.** The manifest is written last and atomically. Failures delete the
  new environment.
- **Renderer inputs.** The renderer passes no arguments. Overrides exist only as app
  environment variables.

**Residual risk:**

- `mag-agent` and its dependencies come from PyPI over TLS without hash pinning
  (`--require-hashes` is not used).
- A previously downloaded private uv is reused without re-verification. It is in a
  0700 folder.
- The pinned digests must be updated whenever `PINNED_UV` changes. A test checks that
  every platform has one.
- The live download path has not been exercised.

**Tests:** `managed_install::tests::*` (10), including:

- `install_downloads_uv_verifies_and_writes_the_manifest_last`, which also shows a
  non-matching archive is refused;
- `extraction_does_not_follow_a_planted_symlink`;
- `extracts_only_the_uv_executable`;
- the opt-in real install.

### Updater

**Assets:** local code execution (installing a package).

**STRIDE:**

- **Tampering.** A malicious or old package (downgrade).

**Mitigations:**

- `updater.rs` registers the plugin only when the bundled config carries a public key.
  The committed config has none, and a test asserts that.
- `tauri-plugin-updater` verifies the minisign signature of the downloaded package
  against that key and refuses mismatches.
- The plugin's default version comparison offers only versions newer than the running
  one, so downgrades are not offered.
- The endpoint is the GitHub Releases `latest.json`, set by release CI.

**Residual risk:**

- Signing-key custody is CI secrets (see `RELEASE_BUILDS.md`).
- The signing key's secrecy is what protects users.
- No rollback protection exists beyond the version comparison.

**Tests:**

- `updater::tests::updater_needs_a_public_key_in_the_config`
- `scripts/test_latest_json.py`
- `src/components/updates-panel.test.tsx`

### Tray and notifications

**Assets:** user trust in OS notifications.

**STRIDE:**

- **Spoofing and tampering.** Agent text shaped to look like instructions or links
  (finding 9).

**Mitigations:**

- Tray labels are fixed strings with counts.
- Run notifications use fixed text.
- Approval notifications pass agent text through `approval_notification_body`: one
  line, control characters removed, at most 240 characters, and `& < >` escaped on
  Linux, where notification servers interpret markup.
- A notification is shown only while the window is unfocused, and only if enabled.

**Residual risk:** the agent still chooses the words.

**Tests:**

- `presence::tests::approval_notifications_show_agent_text_literally`
- the other `presence` tests

### Content security policy

The policy is `default-src 'self'; script-src 'self'; style-src 'self'
'unsafe-inline'; img-src 'self' asset: data: https://asset.localhost; connect-src 'self'
ipc: http://ipc.localhost; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.

**Properties:**

- No remote scripts, images, or fetches.
- HTML and SVG artifacts render in `<iframe sandbox="">` (no scripts, opaque origin),
  which also inherits this CSP.

**Residual risk:**

- `style-src 'unsafe-inline'` allows injected inline styles if an HTML sink were ever
  added.
- There is no `form-action`, but the sandboxed frames cannot submit forms.

**Tests:** `tauri.conf.json` is asserted by `updater` and bundle tests. CSP behavior
itself is not tested automatically.

### Key entry

**Assets:** provider API keys.

**STRIDE:**

- **Information disclosure.** Through logs, errors, argv, crash reports, diagnostics,
  or the network.

**Mitigations:**

- **Renderer.** The key lives only in the password input element (not React state),
  and the field is cleared after a successful save.
- **Transport.** It crosses IPC once to `magent_auth_add` and is refused in remote
  mode. It is piped to `magent auth add --api-key-stdin`, so it never appears in argv.
- **Outputs.** It is scrubbed from the returned stdout, stderr, and command string.
- **Diagnostics.** Bundles redact keys whose names mention key, token, secret,
  password, authorization, or credential, plus `sk-…` and long token-shaped words.
- **Crash reports.** The error boundary logs the error, not the component state.

**Residual risk:**

- The key sits in renderer memory while typed.
- Storage is MagAgent's: the OS keychain, or its owner-only `config.toml`.
- Diagnostics redaction is heuristic.

**Tests:**

- `provider_keys::tests::key_is_never_part_of_argv`
- `rejects_injection_shaped_provider_ids_and_storage`
- the opt-in real `magent auth add` test
- `tests::diagnostics_redact_keys_and_secret_like_text`
- `src/lib/remote-mode.test.ts`

## Related

- `docs/SECURITY.md`: the security boundaries in brief.
- `docs/EXTENSIONS_AND_REMOTE.md`: the remote runtime and the extension API.
- `docs/ARCHITECTURE.md`: the managed install, harness adapters, and diff review.
