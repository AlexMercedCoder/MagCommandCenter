# Workspace and automation

## Workspace

Open **Workspace** after selecting a project. File discovery ignores generated and private directories, does not follow symlinks, and returns at most 1,000 entries. The list renders 200 entries at a time. Text and image previews are bounded to 5 MiB; unsupported binary files show metadata instead of being decoded as text.

Select up to 20 files as agent context. Command Center asks the native bridge to rebuild the context at send time, limiting each inline file to 256 KiB and the combined payload to 750 KiB. Uploaded files are copied into `.magent/attachments/<session>` and follow the same size and path rules. Remove a context chip to exclude it from the next ask.

The Git tab supports working and staged diffs, stage, unstage, and confirmed discard. Branch and worktree creation validates branch names and confines new worktrees to safe sibling locations. Removal always requires confirmation. Review handoff detects the `origin` host and uses an already-authenticated `gh` or `glab` CLI to view or create a draft pull/merge request; credentials are never read by the app.

The command tab accepts a quoted argument vector such as `npm test` or `git status --short`. It does not use a shell. Shell operators are passed literally, execution is limited to the project directory, timeout is 1–120 seconds, and combined output is capped at 256 KiB.

## Group sessions

Create a group from Agent Chat and select two to five OAP profiles:

- **Sequential** passes attributed findings from one specialist to the next.
- **Parallel** gives each specialist the independent user request.
- **Coordinator** gathers specialist results and asks the selected coordinator to synthesize them.

Every participant is pinned to a profile digest and receives a separate durable task. The transcript records the speaker. Forking copies the current transcript into a child session; compacting replaces older messages with a bounded summary; export downloads a Markdown record.

Permission mode is session-scoped: paranoid, balanced, silent safe-auto, or yolo/full-auto. Selecting full-auto requires confirmation. The chosen mode is passed to MagAgent, which remains the enforcement authority.

## Schedules and approvals

Create graph schedules in **Runs**. Command Center validates and plans the graph before saving a schedule. Gate-free graphs may execute automatically while the app is open. A graph with one or more human gates changes to **waiting approval** when due and cannot run until **Approve run** is selected. Pause, resume, run-now, and delete are available per schedule. Timezone, next run, last result, and failures are durable.

Schedules are intentionally an in-app facility, not an operating-system daemon. For unattended execution use an external scheduler invoking MagAgent directly and apply the same approval policy at that boundary.
