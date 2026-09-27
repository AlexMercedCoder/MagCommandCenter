# Release Builds

Mag Command Center uses GitHub Actions to build desktop artifacts on platform-native runners.

## Workflow

The workflow lives at `.github/workflows/desktop-build.yml` and runs on:

- pushes to `main`
- pull requests to `main`
- tags matching `v*`
- manual `workflow_dispatch`

## Artifacts

- Linux: `.deb`, `.rpm`, and `.AppImage`
- macOS Apple Silicon: `.dmg` and `.app`
- macOS Intel: `.dmg` and `.app`
- Windows: NSIS `.exe` and `.msi`

The workflow intentionally builds each platform on its own OS runner. This avoids the fragile cross-compilation path that commonly breaks Tauri Windows and macOS packages.

The workflow uses separate macOS build targets for Apple Silicon and Intel builds so users can choose the installer that matches their machine architecture.

Tag pushes matching `v*` publish a GitHub release and attach the generated installers, checksums, and SBOMs. Distribution signing, notarization, updater readiness, and first-run trust notes are covered in [DISTRIBUTION.md](DISTRIBUTION.md).

## Local Verification

Run the full pre-release gate in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). The core commands are:

Tests:

```bash
npm test
```

Audit:

```bash
npm audit
```

Frontend:

```bash
npm run build
```

Rust:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Linux native bundles:

```bash
PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig npm run tauri -- build --bundles deb,rpm,appimage
```

The repo Tauri config uses `targets = "all"` so platform CI can request native bundles.
The AppImage uses Tauri's generated `mag-command-center` desktop icon identifier so
`linuxdeploy` can resolve the packaged hicolor icons and create the matching root link.

## Jobs and permissions

| Job            | Runs on             | What it does                                                                                                         | Token permissions                                           |
| -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `quality`      | every push, PR, tag | release metadata check, format, lint, coverage, build, Playwright, audit, frontend SBOM                              | read                                                        |
| `build`        | after `quality`     | tests and native bundles on Linux, macOS (Apple Silicon and Intel), Windows; signing when secrets exist; native SBOM | read                                                        |
| `upgrade-test` | after `build`       | installs the previous release, seeds data, upgrades to this build, verifies the data (see below)                     | read                                                        |
| `publish`      | `v*` tags only      | strict metadata check, `SHA256SUMS`, provenance attestations, GitHub release                                         | `contents: write`, `id-token: write`, `attestations: write` |

The workflow default is `contents: read`, so pull-request runs never hold a write token.

## Release metadata check

`scripts/check_release_metadata.py` compares the versions in `package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `Cargo.lock`, the README
`Release:` line, and the release-notes files. Manifest disagreement always fails. Stale
README or release-notes references only warn on branches and fail on a `v*` tag, where
the tag must also equal `v<package.json version>`. Add `--json` for machine output.

## What a release contains

The publish job attaches:

- every installer (`.deb`, `.rpm`, `.AppImage`, `.dmg`, `.msi`, NSIS `.exe`);
- `SHA256SUMS` covering all of the above plus the SBOMs;
- `mag-command-center.cdx.json` (CycloneDX SBOM of the npm frontend) and
  `mag-command-center-native.cdx.json` (CycloneDX SBOM of the Rust crates for all targets);
- a GitHub build-provenance attestation per installer.

The release body is `docs/RELEASE_NOTES_<version>.md` followed by verification steps and
a per-platform signing status line, so an unsigned platform is always stated.

## Packaged upgrade test

The `upgrade-test` job proves that upgrading keeps user data. On Linux it upgrades the
previous release's `.deb` with `dpkg -i` and runs the previous and new AppImages against
the same data directory; on Windows it upgrades the previous `.msi` silently with
`msiexec`. In each case the previous release starts first so it creates its own state
database, then `scripts/upgrade-test/state_db.py` seeds projects, a chat session, and
settings, the new build is installed and launched, and the job asserts that every seeded
row survived, the schema is current, a pre-migration backup exists, and
`app_meta.last_opened_version` names the new build. Logs are uploaded as
`upgrade-test-logs-<platform>`. If there is no previous release with installers for that
platform, the job skips with a notice. macOS is checked manually once before 1.0.

Debian orders `1.0.0` below `1.0.0-5` (the rc.5 native version), so `apt install` treats
an rc-to-1.0.0 upgrade as a downgrade and asks for `--allow-downgrades`; `dpkg -i`
installs it directly. The job prints a warning when it sees this ordering.

## Signing secrets

Signing runs automatically when the secrets below exist in the repository (Settings >
Secrets and variables > Actions). Without them each step logs a notice and the build
continues unsigned; nothing fails. Never commit certificates or keys.

### macOS (Developer ID, $99/year Apple Developer Program)

| Secret                                                       | Value                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`                                          | base64 of the exported Developer ID Application `.p12` (`base64 -i cert.p12`) |
| `APPLE_CERTIFICATE_PASSWORD`                                 | the `.p12` export password                                                    |
| `APPLE_SIGNING_IDENTITY`                                     | e.g. `Developer ID Application: Alex Merced (TEAMID)`                         |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`                | notarization with an app-specific password, or                                |
| `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_PRIVATE_KEY` | notarization with an App Store Connect API key (the `.p8` contents)           |

The three signing secrets enable signing; either notarization set also enables
notarization. `scripts/signing/configure-macos.sh` exports only non-empty values for
Tauri, and the build then runs `codesign --verify` (plus `spctl --assess` when notarized).

### Windows

Pick one:

| Secret                         | Value                                     |
| ------------------------------ | ----------------------------------------- |
| `WINDOWS_CERTIFICATE`          | base64 of an OV or EV code-signing `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | the `.pfx` password                       |

or Azure Trusted Signing:

| Secret                                                      | Value                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` | service principal with the Trusted Signing Certificate Profile Signer role |
| `AZURE_TRUSTED_SIGNING_ENDPOINT`                            | e.g. `https://eus.codesigning.azure.net`                                   |
| `AZURE_TRUSTED_SIGNING_ACCOUNT`                             | the Trusted Signing account name                                           |
| `AZURE_TRUSTED_SIGNING_PROFILE`                             | the certificate profile name                                               |

`scripts/signing/configure-windows.ps1` imports the certificate (or installs
`trusted-signing-cli`) and passes Tauri a `--config` overlay with the thumbprint or sign
command. The build then requires `Get-AuthenticodeSignature` to report `Valid` for every
`.msi` and `.exe`.

### Linux

Linux packages are not signed. Users verify them with `SHA256SUMS` and
`gh attestation verify`.

### Updater

The Tauri updater is not enabled yet. It needs its own signing key pair, which is planned
separately (C-11).

## Troubleshooting

- Missing `.icns` or `.ico` usually means the Tauri icon set was not generated. Run `npm run tauri icon src-tauri/icons/icon.png`.
- Linux WebKit failures usually mean system packages are missing. See the README Linux dependency list.
- Windows NSIS/MSI failures usually involve missing WebView2, WiX, NSIS, or icon metadata. The workflow installs NSIS and WiX on a native Windows runner so those failures are visible in CI rather than hidden by cross-compilation.
