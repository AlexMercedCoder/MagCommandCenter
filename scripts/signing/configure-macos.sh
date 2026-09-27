#!/usr/bin/env bash
# Enable macOS code signing and notarization for the Tauri build when secrets exist.
#
# Reads (all optional; see docs/RELEASE_BUILDS.md "Signing secrets"):
#   APPLE_CERTIFICATE            base64 of the Developer ID Application .p12
#   APPLE_CERTIFICATE_PASSWORD   password for that .p12
#   APPLE_SIGNING_IDENTITY       e.g. "Developer ID Application: Name (TEAMID)"
#   APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID                     notarize with an app password
#   APPLE_API_ISSUER, APPLE_API_KEY, APPLE_API_PRIVATE_KEY      or with an App Store Connect key
#
# Without the three signing secrets nothing is exported and the build stays unsigned.
# Tauri only looks at whether these variables exist, so empty values must never be
# exported. Writes MCC_SIGNING_STATUS to $GITHUB_ENV and a line to the step summary.
set -euo pipefail
env_file="${GITHUB_ENV:-/dev/null}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
label="${MCC_ARTIFACT_LABEL:-macos}"

export_var() { # name value (multi-line safe, value stays masked by Actions)
  local delimiter="MCC_EOF_$RANDOM$RANDOM"
  { echo "$1<<$delimiter"; printf '%s\n' "$2"; echo "$delimiter"; } >>"$env_file"
}

status="unsigned"
if [ -n "${APPLE_CERTIFICATE:-}" ] && [ -n "${APPLE_CERTIFICATE_PASSWORD:-}" ] && [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  export_var APPLE_CERTIFICATE "$APPLE_CERTIFICATE"
  export_var APPLE_CERTIFICATE_PASSWORD "$APPLE_CERTIFICATE_PASSWORD"
  export_var APPLE_SIGNING_IDENTITY "$APPLE_SIGNING_IDENTITY"
  status="signed"
  if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    export_var APPLE_ID "$APPLE_ID"
    export_var APPLE_PASSWORD "$APPLE_PASSWORD"
    export_var APPLE_TEAM_ID "$APPLE_TEAM_ID"
    status="signed and notarized"
  elif [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_PRIVATE_KEY:-}" ]; then
    key_path="${RUNNER_TEMP:-/tmp}/AuthKey_${APPLE_API_KEY}.p8"
    printf '%s\n' "$APPLE_API_PRIVATE_KEY" >"$key_path"
    chmod 600 "$key_path"
    export_var APPLE_API_ISSUER "$APPLE_API_ISSUER"
    export_var APPLE_API_KEY "$APPLE_API_KEY"
    export_var APPLE_API_KEY_PATH "$key_path"
    status="signed and notarized"
  else
    echo "::warning::macOS signing is configured but notarization secrets are missing; Gatekeeper will still warn."
  fi
else
  echo "::notice::macOS signing secrets are not set; building an unsigned app."
fi
export_var MCC_SIGNING_STATUS "$status"
echo "- ${label}: ${status}" >>"$summary"
echo "macOS build will be ${status}."
