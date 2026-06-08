# Distribution

This document tracks what must be true before Mag Command Center feels trustworthy to install outside a developer machine.

## Artifact Flow

- Pushes and pull requests run the desktop build workflow for Linux, macOS Apple Silicon, macOS Intel, and Windows.
- Tag pushes matching `v*` build the same artifacts and draft a GitHub release with installers attached.
- Current release artifacts are unsigned until platform signing credentials are configured.

## Local Preflight

Run the complete release gate before pushing a release tag:

```bash
npm test
npm run build
npm audit
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo fmt --check --manifest-path src-tauri/Cargo.toml
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo test --manifest-path src-tauri/Cargo.toml
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig cargo check --manifest-path src-tauri/Cargo.toml
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig npm run tauri -- build --bundles deb,rpm
```

## macOS Signing And Notarization

Unsigned macOS `.dmg` and `.app` builds may trigger Gatekeeper warnings. Before a broad public release:

- Enroll or use an existing Apple Developer account.
- Create a Developer ID Application certificate.
- Store the certificate and password as GitHub Actions secrets.
- Configure Tauri macOS signing identity and notarization credentials.
- Verify a downloaded CI `.dmg` opens on a clean macOS machine without manual quarantine workarounds.

Release artifacts include separate macOS installers:

- Apple Silicon Macs should use the `aarch64` DMG.
- Intel Macs should use the `x64` or `x86_64` DMG.

## Windows Signing

Unsigned Windows `.exe` and `.msi` builds may trigger SmartScreen warnings. Before a broad public release:

- Acquire a code-signing certificate.
- Store signing material as GitHub Actions secrets.
- Add a signing step for NSIS and MSI outputs.
- Verify a downloaded CI installer on a clean Windows machine.

## Linux Distribution

The workflow currently builds `.deb` and `.rpm` installers. Before a broad public release:

- Verify install/uninstall on a clean Ubuntu or Debian VM.
- Verify install/uninstall on a clean Fedora-compatible VM.
- Consider AppImage later if users need a single-file portable Linux artifact.

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
- Recommend MagAgent `0.30.1+` so first-run users get the provider credential wizard, clearer missing-key diagnostics, Python 3.14-compatible MagGraph wheels, and improved session feedback.

Keep the README, in-app Docs tab, and release notes aligned with the unsigned artifact status until signing is complete.
