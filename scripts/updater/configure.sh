#!/usr/bin/env bash
# Enable signed updater artifacts for this build when the updater key exists.
#
# Reads (see docs/RELEASE_BUILDS.md "Updater"):
#   TAURI_SIGNING_PRIVATE_KEY           secret: content of the key from `tauri signer generate`
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  secret: its password (may be empty)
#   MCC_UPDATER_PUBKEY                  repository variable: the matching public key
#   GITHUB_REPOSITORY                   owner/repo for the latest.json endpoint
#
# With all present, writes a Tauri config overlay that turns on createUpdaterArtifacts
# and plugins.updater, and appends `--config <overlay>` to MCC_TAURI_ARGS. Without them it
# changes nothing: the build has no updater and the app points users to GitHub Releases.
set -euo pipefail
env_file="${GITHUB_ENV:-/dev/null}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] || [ -z "${MCC_UPDATER_PUBKEY:-}" ]; then
  echo "::notice::Updater key not configured; building without in-app updates."
  echo "- updater: off (no TAURI_SIGNING_PRIVATE_KEY / MCC_UPDATER_PUBKEY)" >>"$summary"
  exit 0
fi
repo="${GITHUB_REPOSITORY:-AlexMercedCoder/MagCommandCenter}"
overlay="${RUNNER_TEMP:-/tmp}/mcc-updater.json"
python_bin="$(command -v python3 || command -v python)"
"$python_bin" - "$overlay" "$repo" <<'PY'
import json, os, sys
path, repo = sys.argv[1], sys.argv[2]
json.dump({
    "bundle": {"createUpdaterArtifacts": True},
    "plugins": {"updater": {
        "pubkey": os.environ["MCC_UPDATER_PUBKEY"].strip(),
        "endpoints": [f"https://github.com/{repo}/releases/latest/download/latest.json"],
    }},
}, open(path, "w"), indent=2)
PY
delimiter="MCC_EOF_$RANDOM$RANDOM"
{
  echo "TAURI_SIGNING_PRIVATE_KEY<<$delimiter"; printf '%s\n' "$TAURI_SIGNING_PRIVATE_KEY"; echo "$delimiter"
  echo "TAURI_SIGNING_PRIVATE_KEY_PASSWORD<<$delimiter"; printf '%s\n' "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"; echo "$delimiter"
  echo "MCC_TAURI_ARGS=${MCC_TAURI_ARGS:-} --config ${overlay//\\//}"
} >>"$env_file"
echo "- updater: on (signed updater artifacts)" >>"$summary"
echo "Updater artifacts enabled."
