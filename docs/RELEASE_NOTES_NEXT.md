# Next Mag Command Center release

Unreleased. Planned as 1.0.0. The in-tree version stays `1.0.0-rc.5` until the release is
cut.

## Stop ends the whole run

- Stop now ends the MagAgent process **and every process it started**: tools, test runners,
  and dev servers. On macOS and Linux the run is its own process group and gets `SIGTERM`,
  then `SIGKILL` after three seconds; on Windows it runs in a Job Object that is terminated.
  Previously only the direct child was killed and grandchildren kept running.
- Quitting the app stops every run it still tracks. On Windows, processes a finished run
  left behind are also ended when the run's job handle closes.
- Workspace commands that time out stop their child processes too, so a background process
  can no longer hold the output open past the timeout.

## Remote runtime (experimental) now works

- The remote runtime talks to MagAgent 1.4's `magent serve --rpc` gateway. Chat, goals,
  and graph runs stream over it (native long polling, with gap resync and reconnects),
  approvals appear in the usual dialog and are answered remotely, and Stop cancels the
  run's process group on the gateway host.
- The token can be saved in the OS credential store per host (never in app state);
  Connect checks the gateway's protocol and shows its version and project roots.
- Still experimental on both sides, and still off by default. Local file and Git views
  keep using this computer. Checked end to end against a local gateway running the
  offline mock provider; approvals over the gateway are covered by MagAgent's recorded
  protocol fixture, not a live run.

## Loro as a second harness (experimental)

- A HarnessAdapter seam separates Chat from the agent CLI. MagAgent stays the default;
  Loro, the governed agent harness, can be turned on in Settings > Experimental features
  and then picked per chat session.
- Loro runs stream in the chat, raise AAIS approvals in the same dialog, and stop with
  Stop (process tree). The prompt goes to Loro in an owner-only temp file, not on the
  command line. Loro uses its own default profile and policy; durable tasks, graphs, and
  memory evidence stay MagAgent only, and Loro is not available over the remote runtime.

## Security review (SEC-1)

A self-review of every app surface is in [THREAT_MODEL.md](THREAT_MODEL.md). It is not an
independent audit. Fixed, each with a regression test:

- **Git no longer runs programs from a project's `.git/config`.** Before, the Git
  views, project inspection, and console Git ran `core.fsmonitor`, external diff and
  textconv helpers, repository filter drivers, hooks on worktree creation, and the
  signature program if the repository configured them. An agent that edited
  `.git/config` could get code run without an approval.
- **Provider keys stay local.** With the remote runtime connected, **Save key** used to
  send the key to the gateway host as request parameters. It is now refused, with a
  message.
- **Uploads cannot be run.** A folder inside `.magent`, where uploads land, can no
  longer be opened as a workspace. Before, an uploaded `package.json` or `Makefile`
  could run through the console's no-dialog `npm test`/`make test` allowlist.
- **Open in editor with the system default refuses files it would run** (`.desktop`,
  `.command`, `.bat`, `.lnk`, executables, and so on). Code editors still open them.
- **Approval requests belong to their stream.** A second stream can no longer replace
  another stream's pending request by reusing its id, and each stream is limited to 32
  pending requests.
- **Remote responses are capped while reading.** Before, a gateway that sent a body
  without a length could fill memory.
- **Managed install.** The uv download is checked against digests pinned in source
  rather than the release's checksum file. Extraction no longer writes through a planted
  symlink, and the install folder is owner-only.
- **MagAgent profile names are validated natively** before any `magent` process starts,
  and deleting a profile is left to the CLI. MagAgent itself does not validate them;
  that fix belongs in MagAgent.
- **OS approval notifications** show agent text as plain, single-line, bounded text. On
  Linux, markup such as links is escaped.
- **Uploads into a new chat session's folder work.** Before, they failed with "No such
  file or directory".
- **Quitting cancels the remote runs this app started** (best effort, about two
  seconds).

## Managed MagAgent install (experimental)

- Setup > **Managed install** sets up MagAgent without a system Python: `uv` installs a
  private CPython 3.12, a virtual environment, and `mag-agent==1.4.0` into the app's local
  data folder, with a step list, progress bar, live install log, and Cancel. Nothing is
  added to `PATH` or shell profiles and the user's uv configuration is ignored. Remove
  deletes the whole folder after a confirmation.
- An installed `uv` is used when one is found (including `~/.local/bin`, `~/.cargo/bin`,
  and Homebrew locations a GUI app's `PATH` misses). Otherwise uv 0.6.14 is downloaded
  from its GitHub release and checked against SHA-256 digests pinned in the app before
  use.
- A completed managed install is the MagAgent every run uses (after `MAGENT_BIN`).
  Upgrades build a new environment and switch only after `magent --version` succeeds.
- Setup's **Detect MagAgent** now checks the same `magent` that runs use. Before, it
  looked only at `PATH`, so it could report "not detected" for a `~/.local/bin` install
  that chats were already using.
- Experimental because the pinned MagAgent 1.4.0 is not on PyPI yet, so the MagAgent step
  fails with an explanation until it is published. The flow was checked end to end with
  real uv against local MagAgent and AAIS sources (about 270 MB for the environment),
  and the download branch with a local, checksum-verified archive. The live uv and
  CPython downloads have not been exercised.

## Diff and checkpoint review

- Git diffs (Files and Git > Working or Staged) and Workbench checkpoint diffs now render
  as a review: a changed-files summary, one collapsible section per file with its status
  and line counts, and hunks with old and new line numbers. Previously both were a plain
  text block.
- **Open in editor** on a file, or **Open at line N** on a hunk, hands the file to the
  editor chosen in Settings > Editor: automatic (VS Code, Cursor, or Zed when found on
  `PATH`, then `$VISUAL`/`$EDITOR`, then the system opener), a specific one of those, or
  the system default. Only existing files inside the active project open; the renderer
  picks from a fixed list and never supplies the executable, and terminal editors such as
  vim or nano are refused because they cannot open without a terminal.

## Hardened IPC

- The Workspace console no longer runs any program the renderer asks for. Read-only Git
  (no `-c`, `--output`, or external diff helpers) and the usual test, lint, and build
  commands (`npm test`, `npm run lint`, `cargo check`, `pytest`, `go test`, ...) run
  directly. Any other program, or any explicit path, opens a native system dialog the
  first time it runs in a project; approving remembers that program for that project
  (the dialog warns when the program is a shell or interpreter). Approved programs are
  listed under the console and can be revoked. Approvals live in a state-database table
  the renderer's generic state API cannot write, so a compromised renderer cannot
  approve itself.
- The content-security policy now allows network connections only to the app's own IPC
  (`connect-src 'self' ipc: http://ipc.localhost`); `https:` and loopback are gone.
- The experimental remote runtime goes through a native proxy: Rust confirms the host in
  a system dialog, keeps the endpoint and token in memory, and forwards JSON-RPC calls
  only to that host. The renderer no longer holds the token after connecting.
- Extensions declare the native commands they need in an `ipc` list, drawn from a fixed
  set of read-only commands; their commands receive a context whose `invoke` refuses
  anything undeclared. Extensions still run inside the renderer, so this scopes the
  supported API rather than sandboxing code.

## Memory used and updates

- Runs > a run > **Memory used** shows what MagAgent recalled for that run (MagAgent 1.4
  memory evidence): turns that used memory, which memories and their scores, tokens
  injected against the budget, and when recall was trimmed. Each memory opens in the
  Memory view. Chat's activity details show the same for the latest answer.
- Settings > **Updates** checks for and installs signed updates when the build carries an
  updater key, restarting after install. Builds without one (including this repository's
  default config) say so and link to GitHub Releases. The updater key is not configured
  yet; see docs/RELEASE_BUILDS.md "Updater".

## Tray and notifications

- A tray icon shows how many approvals are waiting ("2 approvals waiting") and brings
  the window back on click or from its menu, which also has Quit.
- While the window is in the background, the app posts an OS notification when MagAgent
  asks for permission and when a chat or graph run finishes or fails. Runs you stop
  yourself are not announced. Settings > Notifications turns either kind off; **Allow
  notifications** asks the OS for permission.
- The old browser-API task notifications were removed; they duplicated these on Windows
  and did nothing in the Linux and macOS webviews.

## Approvals

- When a run exits while an approval is still pending, the request is reported as
  **Approval interrupted** ("nothing was approved") instead of silently disappearing, and
  the run's activity log records it.
- **Esc** or the new **Decide later** button hides the approval dialog without deciding.
  The request stays pending and a "permission requests waiting" button reopens it. Deny
  remains an explicit button in the tab order, placed beside Decide later and apart from
  the Allow buttons.
- Approval requests and receipts are pushed from the native runtime as events instead of
  being polled every 800 ms, so the dialog opens and the receipt toast appears as soon
  as MagAgent emits them.
- The approval dialog is opaque again in both themes. Two theme tokens it relied on were
  never defined, so it rendered transparent over the blurred page.

## First run without a terminal

- Setup now walks a new user through creating a local MagAgent profile, then either
  saving a provider key or starting an **offline demo** with MagAgent's `mock` provider
  (labeled canned replies, no model, no key).
- Keys are typed into a masked field (with a show/hide toggle) and sent over stdin to
  `magent auth add <provider> --api-key-stdin`. They never appear in argv, the command
  history, app state, or logs, and any echo is scrubbed. Storage is the system keychain
  when MagAgent can reach one, otherwise MagAgent's owner-only `config.toml`.
- **Test connection** sends one short prompt through the provider and only runs when
  clicked.
- The same panel is available in Settings.
- Requires MagAgent **1.4.0** (unreleased), which adds `--api-key-stdin`, the `mock`
  provider, and memory evidence. `magAgentCompatibility.minimumVersion` is now 1.4.0.

## Navigation redesign

- The rail now has three sections, **Chat**, **Runs**, and **Projects**, with Settings and
  Help at the bottom. A red badge on Runs counts work that needs you.
- Everything else is contextual: the Projects sidebar lists project tools (Files and Git,
  Graph Board, Agents) and the library (Memory, Research, Workbench, SQLite, Plugins, Tools
  and extensions). Chat's sidebar lists sessions with a New button. The command palette
  also searches view descriptions.
- New default shortcuts: Mod+1 Chat, Mod+2 Runs, Mod+3 Projects, Mod+4 Files and Git,
  Mod+5 Graph Board, Mod+, Settings, / Help. Saved custom shortcuts from earlier versions
  are replaced by these once (they pointed at the old layout).
- Consistency pass: older panels lose the heavy borders and offset shadows, layouts adapt
  to the content column (Memory and SQLite no longer run off the right edge at laptop
  widths; Runs stacks on narrow windows), run filter tabs wrap, the empty memory-graph
  message is readable, and the SQLite and Memory headings are visible in light mode.
- Toasts: successful commands no longer toast (their view shows the result); failures say
  what MagAgent printed, repeated messages show once, and phones show at most two.

## Layout

- Scrolling a long page (for example Settings) no longer scrolls the navigation rail,
  project sidebar, and page header away. The shell used `overflow-x: hidden`, which
  silently disabled their sticky positioning; it now uses `overflow-x: clip`.
- The Setup page's install controls were white text on a white panel and looked like
  empty boxes; they are readable again in both themes.

## Experimental features

- Group sessions, the renderer extension API, and the remote runtime are labeled
  **experimental**: they work but are outside the 1.0 stability promise.
- The remote runtime is **off by default**. No MagAgent release ships the JSON-RPC gateway
  it needs yet, so its connection form appears only after turning on Settings >
  Experimental features > Remote runtime. The docs previously claimed streaming degrades to
  a final result in remote mode; it is refused, and the docs now say so.

## Upgrades and state

- The state database moves to schema 4, adding `app_meta` with the last app version that
  opened it. It is migrated at startup (with a `command-center.v2.sqlite3.backup`), not on
  the first renderer request. A database from a newer schema is refused rather than
  re-stamped.
- Upgrading an rc `.deb` with `apt install` is seen as a downgrade because Debian orders
  `1.0.0` below `1.0.0-5`. Use `sudo dpkg -i` or `apt install --allow-downgrades`.

## Code health

- Fixed: after selecting a different Graph Board card, the Node ID field still showed
  the first card's id, so **Rename** could rename the selected card to another card's
  id. The field now follows the selection.

- `App.tsx` (2,300 lines, 78 `useState` calls) and `graph-board-panel.tsx` (2,900 lines)
  are split into zustand feature stores and focused components; no component is over
  800 lines. The agents, chat, and workspace panels are split the same way.
- ESLint now enforces `react-hooks/exhaustive-deps` and `no-unused-vars`; the 14 hook
  dependency findings were fixed properly and 296 unused imports removed.
- `styles.css` is split into feature style sheets in cascade order.
- The refactor was checked against the previous build: 46 screens in both themes are
  pixel-identical, and computed styles match at desktop and phone widths.
- The logic-coverage floor is raised (statements 60%, branches 55%, functions 65%,
  lines 65%) and now includes the new stores.

## Release engineering

- Every release attaches `SHA256SUMS`, a CycloneDX SBOM for the frontend and one for the
  native Rust crates, and build-provenance attestations; the release body lists signing
  status per platform.
- macOS signing and notarization and Windows signing (certificate or Azure Trusted
  Signing) run automatically once their secrets exist. No secrets are configured yet, so
  macOS and Windows installers remain **unsigned**; Linux is verified by checksum and
  provenance.
- A packaged upgrade test installs the previous release on Linux (`.deb`, AppImage) and
  Windows (`.msi`), seeds projects and sessions, upgrades, and verifies the data survived.
- CI jobs get a read-only token; only the tag-gated publish job can write.
- Dependabot groups are split (React major, build tooling, cargo, everything else) so one
  breaking major cannot block the other updates.
- `scripts/check_release_metadata.py` checks that versions agree across manifests, the
  README, and release notes; strict on tags.
- README opens with the product's one-line role and a "Which tool do I want?" table
  shared with MagAgent, Loro, and Merced AI.

## Earlier unreleased changes

- Adds a first-class WebMCP console with exact-origin management, live schema discovery,
  revision-bound calls, mutating-call confirmation, structured results, and setup guidance.

## Chat responsiveness and clarity

- Long-running MagAgent and setup processes now wait on Tauri's blocking worker pool, keeping the desktop renderer, navigation, timers, approval dialogs, and cancellation responsive.
- Streamed runs emit a two-second lifecycle heartbeat so a quiet provider call remains visibly alive without exposing private chain-of-thought.
- Active durable tasks are automatically selected and polled after restart, with elapsed time restored from the task timestamp.
- Chat uses labeled project, session, agent, and permission controls; familiar conversation bubbles; automatic transcript following; and a visible Stop action while work is active.
- The composer clears after dispatch and restores the prompt if startup fails.
- Light and dark native form controls now receive explicit foreground, background, placeholder, disabled, and option colors to avoid operating-system color-scheme contrast mismatches.
- The control bar wraps at the actual desktop content width, keeping Open and New horizontal instead of collapsing their labels into vertical text.
- The transcript now separates conversation from telemetry: streamed/final assistant messages render as MagAgent bubbles, stable activity metadata renders as concise progress summaries, and verbose tool evidence stays in compact expandable rows.
- Progress summaries intentionally describe lifecycle and intent without exposing private chain-of-thought.

## Graph authoring parity

- Graph generation is now a permanent, prominent entry point even when a board is already loaded, with **Generate with AI**, **Blank graph**, and **Open file** actions matching the MagAgent web UI's core authoring flow.
- Deterministic drafting remains available under **More options** for fast, quota-free scaffolding.
- Existing graph editing, strict validation, safe save, plan review, execution status, cancellation, retry, and durable recovery remain available below the generator.

## Validation

- TypeScript typecheck, ESLint, production Vite build, and the complete front-end test suite.
- Recovery regression coverage for active and completed durable tasks.
- Rust formatting, native compilation, and native unit tests with GTK 3/WebKitGTK 4.1.
- A deterministic Playwright visual fixture verifies real control colors and dimensions, timer/heartbeat progress, typing during active work, and cancellation without a model call.
