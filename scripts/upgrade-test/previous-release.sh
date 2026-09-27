#!/usr/bin/env bash
# Download the previous release's installers for the packaged upgrade test.
#
# Usage: scripts/upgrade-test/previous-release.sh <linux|windows> [output-dir]
# Needs the gh CLI with GH_TOKEN. Picks the newest non-draft release whose tag is not the
# ref being built, downloads its .deb/.AppImage (linux) or .msi (windows), and writes
# found=true|false and tag=<tag> to $GITHUB_OUTPUT when it is set.
set -euo pipefail
platform="${1:?usage: previous-release.sh <linux|windows> [output-dir]}"
out="${2:-previous}"
repo="${GITHUB_REPOSITORY:-AlexMercedCoder/MagCommandCenter}"
current="${GITHUB_REF_NAME:-}"

output() { [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1" >>"$GITHUB_OUTPUT"; echo "$1"; }

tag="$(gh release list --repo "$repo" --limit 30 --exclude-drafts --json tagName \
  --jq "[.[] | select(.tagName != \"$current\")][0].tagName // empty")"
if [ -z "$tag" ]; then
  echo "::notice::No previous release to upgrade from; skipping the packaged upgrade test."
  output found=false
  exit 0
fi

mkdir -p "$out"
case "$platform" in
  linux) patterns=(--pattern '*.deb' --pattern '*.AppImage') ;;
  windows) patterns=(--pattern '*.msi') ;;
  *) echo "platform must be linux or windows" >&2; exit 2 ;;
esac
if ! gh release download "$tag" --repo "$repo" --dir "$out" --clobber "${patterns[@]}"; then
  echo "::notice::Release $tag has no $platform installers; skipping the packaged upgrade test."
  output found=false
  exit 0
fi
ls -l "$out"
output found=true
output "tag=$tag"
