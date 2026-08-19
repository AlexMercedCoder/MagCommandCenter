# OAP Profile Center

Profile Center makes Open Agent Profile v1 identities understandable and operational without
turning them into another generic settings form.

## Product Model

The screen leads with identity: name, purpose, visible mark, role, and effective authority.
Provider and model choices are part of that identity, but credentials stay in MagAgent's shared
configuration and keyring. Profiles may narrow tools, network, memory, skills, MCP servers, and
delegation. They cannot grant authority beyond the active harness, enabled capabilities, parent
profile, permission policy, or filesystem sandbox.

This boundary is deliberate:

- A profile is who the agent is and how it works.
- A MagAgent user owns shared configuration and credentials.
- A project supplies the active workspace and project-local profiles.
- A chat session pins one profile revision for continuity.
- A project crew is a Command Center grouping of profile identities and roles.

## Interaction Principles

The implementation borrows useful patterns from multi-agent desktop and bot products while
keeping MagAgent's local-first safety model:

- Identity-first creation: start from a named purpose and template, then progressively disclose
  model, tools, network, memory, and delegation details.
- Obvious active identity: chat shows the selected profile beside project and session controls.
- Persistent agents: user, project, portable, plugin, and managed profiles appear in one grouped
  rail and remain shared with the CLI.
- Project teams: profiles may be assigned specialist roles and one coordinator without copying
  credentials or profile files.
- Effective authority: review what the harness will actually allow, not only what the profile
  requested.
- Reviewable adaptation: profile-state proposals have an inbox; edits use optimistic concurrency
  and restorable checkpoints.
- Portable lifecycle: clone, import, and secret-safe export use MagAgent's machine API.

## Machine Boundary

The desktop invokes `agent schema`, `preview`, `apply`, `revisions`, `restore-revision`, `clone`,
`import`, `export`, and `delete`. Profile documents travel over stdin. Command Center never
imports MagAgent Python modules, edits profile files directly, resolves inheritance, or decides
effective permission policy.

Project crews are stored in Command Center's native SQLite state. Every operational action still
passes an explicit profile name to MagAgent. MagAgent resolves the current profile document and
policy again at execution time. Gateway assignment writes `gateway.agent_profile` through
`magent config set`; it does not copy a profile or expose gateway tokens.
