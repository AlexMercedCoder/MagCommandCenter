# Mag Command Center 0.4.0

Status: release candidate, not yet published.

Mag Command Center 0.4.0 adds Profile Center for Open Agent Profile v1 identities.
Users can create agents through a guided five-step builder, inspect requested and effective
authority, select providers and discovered models, manage tools, skills, MCP servers, memory,
delegation, context, hooks, and network access, and safely clone, import, export, delete, or
restore revisions.

Chats pin profile name and digest, report revision drift, and use the selected identity for
asks and staged goals. Project crews can assign specialist roles and a coordinator; research,
recipe plans, and Agentic Graph runs carry the active profile back to MagAgent. Profile state
proposals remain reviewable rather than being silently applied. A guarded profile action can
also assign the identity to new Slack, Discord, and Telegram gateway sessions through MagAgent's
shared configuration.

This release requires MagAgent 0.95.0 and its `magent.oap-profile.v1` authoring contract.
No release has been published from this candidate.

## Candidate Validation

- Frontend production build passed.
- 48 Vitest tests passed, including profile builder, live model-name normalization,
  stdin transport, profile detail, gateway assignment, revision restore, pinned sessions,
  and accessibility checks.
- Six native Rust tests passed and `cargo fmt --check` is clean.
- Linux release packaging produced DEB and RPM artifacts for 0.4.0; the corrected AppDir
  also packaged into an AppImage and launched with the expected window geometry.
- Repository diff and secret-pattern checks found no credentials in the candidate changes.
