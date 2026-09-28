# Distribution

Graph Board releases require the paired MagAgent authoring contract, durable graph-task metadata,
selective gate approval, and safe rename commands to pass before installers are published. The
desktop build matrix is the authority for Linux, Windows, macOS Intel, and macOS Apple Silicon.
Graph Board smoke review must cover load, edit, YAML/JSON round trip, draft recovery, external-file
conflict, validate, gate review, run, pause/resume, cancel, and digest-safe resume.

This document tracks what must be true before Mag Command Center feels trustworthy to install outside a developer machine.

## Artifact Flow

- Pushes to `main`, pull requests to `main`, and manual runs execute the desktop build workflow for Linux, macOS Apple Silicon, macOS Intel, and Windows.
- Tag pushes matching `v*` build the same artifacts and publish a GitHub release with installers attached.
- Tagged builds also publish `SHA256SUMS`, CycloneDX SBOMs for the frontend and the native crates, and GitHub build-provenance attestations.
- macOS and Windows signing run automatically once their secrets exist ([RELEASE_BUILDS.md](RELEASE_BUILDS.md#signing-secrets)); until then those installers are unsigned and the release notes say so per platform.
- Every build runs a packaged upgrade test from the previous release on Linux and Windows.
- WiX/MSI permits only numeric prerelease identifiers. Release candidates such as `1.0.0-rc.5` therefore used native bundle version `1.0.0-5`, while release notes and tags kept the human-readable RC label. Stable releases such as `1.0.0` use the same plain version everywhere.

## Local Preflight

Run the complete release gate before pushing a release tag:

```bash
npx playwright install chromium
npm run validate
npm audit --audit-level=high
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo fmt --check --manifest-path src-tauri/Cargo.toml
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo test --manifest-path src-tauri/Cargo.toml
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo check --manifest-path src-tauri/Cargo.toml
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig npm run tauri -- build --bundles deb,rpm
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig npm run tauri -- build --bundles appimage
```

## macOS Signing And Notarization

Unsigned macOS `.dmg` and `.app` builds may trigger Gatekeeper warnings. Before a broad public release:

- Enroll or use an existing Apple Developer account.
- Create a Developer ID Application certificate.
- Add the macOS secrets listed in [RELEASE_BUILDS.md](RELEASE_BUILDS.md#signing-secrets). The workflow already signs, notarizes, and verifies when they exist.
- Verify a downloaded CI `.dmg` opens on a clean macOS machine without manual quarantine workarounds.

Release artifacts include separate macOS installers:

- Apple Silicon Macs should use the `aarch64` DMG.
- Intel Macs should use the `x64` or `x86_64` DMG.

## Windows Signing

Unsigned Windows `.exe` and `.msi` builds may trigger SmartScreen warnings. Before a broad public release:

- Acquire an OV/EV code-signing certificate or an Azure Trusted Signing account.
- Add the Windows secrets listed in [RELEASE_BUILDS.md](RELEASE_BUILDS.md#signing-secrets). The workflow already signs both MSI and NSIS outputs and verifies the signatures when they exist.
- Verify a downloaded CI installer on a clean Windows machine.

## Linux Distribution

The local bundle configuration produces `.deb`, `.rpm`, and AppImage artifacts. The
AppImage configuration supplies a Linux-only desktop entry whose icon name matches
Tauri's product-name icon at the AppDir root. Before a broad public release:

- Verify install/uninstall on a clean Ubuntu or Debian VM.
- Verify install/uninstall on a clean Fedora-compatible VM.
- Launch the AppImage on a clean Linux desktop and verify its icon and profile workflows.

## Updater Channel

Tauri v2 updater support requires signed updater artifacts and a stable update endpoint. Do not enable in-app update checks until all of these exist:

- Tauri updater signing key pair.
- Public updater key committed into Tauri configuration.
- Private updater key stored only in release secrets.
- HTTPS endpoint or GitHub-release-backed update manifest.
- Policy for stable, prerelease, and rollback behavior.

The Tauri updater plugin expects signed update metadata and configured endpoints. Shipping an updater without signatures or a durable endpoint would reduce trust instead of improving it.

## First-Run Support

The Setup tab should remain the primary first-run path:

- Detect `magent --version`.
- Explain missing PATH, outdated version, and permission failures.
- Install or upgrade with the allowlisted bootstrap commands only.
- Require MagAgent `1.4.0+` (or a pre-release build advertising the 1.4 memory-evidence contract) and negotiate desktop CLI v1, task v2, task-event v1, memory-recall v2, OAP 1.0, and AGS 1.0 so first-run users get the complete governed execution surface used by this release.

Keep the README, in-app Docs tab, and release notes aligned with the unsigned artifact status until signing is complete.
