# MagCommandCenter 1.0.0-rc.5

Release notes — September 12, 2026.

- The native bridge validates AAIS events and retains pending requests across renderer reloads. The presenter shows decision delivery separately from the harness resolution and retries with the same decision ID.
- Approval dialogs capture and restore keyboard focus and display origin and expiry.
- MagAgent 1.3.0 or newer is required so concurrent native runs use the repaired approval transactions.
- Fresh installs start with no maintainer-specific project path.
- Unsupported remote streaming and approval-dependent execution fail early with a native-transport explanation.
- Installer publication runs once, after quality and all platform builds. Visual tests and failure artifacts are part of the quality gate.

This remains a release candidate. macOS/Windows installer upgrades, signing/notarization and live-provider qualification require their platform release jobs and remain necessary before general availability. Renderer recovery is supported while the native process still owns the child; it does not resurrect a child after native-app exit.

AGS, OAP and AAIS document/wire formats remain unchanged. Local validation evidence and remaining platform gates are recorded in the ecosystem release report.
