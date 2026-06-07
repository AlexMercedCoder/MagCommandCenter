# Release Builds

Mag Command Center uses GitHub Actions to build desktop artifacts on platform-native runners.

## Workflow

The workflow lives at `.github/workflows/desktop-build.yml` and runs on:

- pushes to `main`
- pull requests to `main`
- tags matching `v*`
- manual `workflow_dispatch`

## Artifacts

- Linux: `.deb` and `.rpm`
- macOS Intel: `.dmg` and `.app`
- macOS Apple Silicon: `.dmg` and `.app`
- Windows: NSIS `.exe` and `.msi`

The workflow intentionally builds each platform on its own OS runner. This avoids the fragile cross-compilation path that commonly breaks Tauri Windows and macOS packages.

## Local Verification

Frontend:

```bash
npm run build
```

Rust:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Linux native bundles:

```bash
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig npm run tauri -- build --bundles deb,rpm
```

The repo Tauri config uses `targets = "all"` so platform CI can request native bundles. Local Linux verification should pass explicit Linux bundles to avoid AppImage sandbox issues on some systems.

## Signing

Current artifacts are unsigned. Before public desktop distribution:

- Configure Apple Developer signing and notarization for macOS.
- Configure Windows code-signing certificates.
- Add Tauri updater metadata after a stable release channel exists.

## Troubleshooting

- Missing `.icns` or `.ico` usually means the Tauri icon set was not generated. Run `npm run tauri icon src-tauri/icons/icon.png`.
- Linux WebKit failures usually mean system packages are missing. See the README Linux dependency list.
- Windows NSIS/MSI failures usually involve missing WebView2, WiX, NSIS, or icon metadata. The workflow installs NSIS and WiX on a native Windows runner so those failures are visible in CI rather than hidden by cross-compilation.
