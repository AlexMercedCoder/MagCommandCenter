# Mag Command Center 0.3.0

Mag Command Center `0.3.0` aligns the desktop cockpit with MagAgent 0.91.0's hardened
machine contracts and adds a desktop workbench for Agentic Graph Specification 1.0.
The release also makes chat the primary workflow and groups advanced tools by purpose.

## Added

- Open and strictly validate `.agraph.yaml`, `.agraph.yml`, and `.agraph.json` files.
- Review deterministic graph plans as a scannable node table with type, intelligence tier,
  parallel group, projected cost, execution bound, concurrency, and human gates.
- Stream graph execution activity through the cancellable desktop process bridge.
- Keep raw plan and run JSON available as collapsible diagnostic details.
- Require a final `Review & Run` confirmation before accepting every graph gate and checkpoint.
- Environment Center for optional tool packs, detected provider credentials, prompt-cache guidance, and negotiated contracts.

## Changed

- Added AGS task states to the typed desktop execution contract.
- Completed task-v2 lifecycle handling for `ready`, `awaiting_human`, `succeeded`, and `skipped` states.
- Grouped navigation into Work, Knowledge, and System with Agent Chat first.
- Added Ctrl/Command+Enter prompt submission while preserving multiline editing.
- Surface invoke and streaming startup failures directly in chat and toast feedback.
- Updated repository and in-app documentation for graph review, safety, and runtime behavior.
- Raised the minimum required MagAgent version to `0.91.0` and require desktop CLI v1,
  task v2, task-event v1, and memory-recall v2 contracts.

## Local Validation

```bash
npm test -- --run
npm run build
npm audit
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo fmt --check --manifest-path src-tauri/Cargo.toml
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo test --manifest-path src-tauri/Cargo.toml
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo check --manifest-path src-tauri/Cargo.toml
```

## Distribution Notes

- GitHub Actions builds Linux, macOS Apple Silicon, macOS Intel, and Windows installers.
- Use published MagAgent `0.91.0` or newer for the complete desktop contract.
- Artifacts remain unsigned until Apple notarization and Windows signing are configured.

## Validation Evidence

Validated locally on Linux on 2026-08-11:

- 38 frontend tests passed.
- TypeScript and the production Vite build passed.
- npm reported zero known vulnerabilities.
- Rust formatting and compilation checks passed.
- 6 native Rust tests passed.
- Tauri produced `Mag Command Center_0.3.0_amd64.deb` and
  `Mag Command Center-0.3.0-1.x86_64.rpm`.

macOS and Windows remain CI artifact gates and are not represented by this Linux validation.
