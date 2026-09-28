#!/usr/bin/env bash
# Packaged upgrade test for Linux: previous release -> new build, data must survive.
#
# Usage:
#   scripts/upgrade-test/linux.sh --new-version 1.0.0 \
#     --old-deb previous/mag.deb --new-deb new/mag.deb \
#     [--old-appimage previous/mag.AppImage --new-appimage new/mag.AppImage]
#
# --new-version is the native version the new build records (tauri.conf.json "version").
# Installs packages with apt/dpkg, so run it on a disposable CI runner or container,
# never on a workstation. Needs xvfb-run, python3, and sudo (or root).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
state_db="python3 $here/state_db.py"
new_version="" old_deb="" new_deb="" old_appimage="" new_appimage=""
while [ $# -gt 0 ]; do
  case "$1" in
    --new-version) new_version="$2"; shift 2 ;;
    --old-deb) old_deb="$2"; shift 2 ;;
    --new-deb) new_deb="$2"; shift 2 ;;
    --old-appimage) old_appimage="$2"; shift 2 ;;
    --new-appimage) new_appimage="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
done
if [ -z "$new_version" ] || [ -z "$old_deb" ] || [ -z "$new_deb" ]; then
  echo "--new-version, --old-deb and --new-deb are required (see --help)" >&2
  exit 2
fi

sudo_cmd=""
[ "$(id -u)" -eq 0 ] || sudo_cmd="sudo"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/com.alexmerced.magcommandcenter"
db="$data_dir/command-center.sqlite3"
logs="${UPGRADE_LOG_DIR:-$PWD/upgrade-logs}"
mkdir -p "$logs"
# Software rendering keeps WebKitGTK stable under Xvfb in containers and CI.
export WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1

app_pid=""
start_app() { # <label> <command...>
  local label="$1"; shift
  setsid xvfb-run -a "$@" >"$logs/$label.log" 2>&1 &
  app_pid=$!
  echo "started $label (pid $app_pid)"
}
stop_app() {
  [ -n "$app_pid" ] || return 0
  kill -TERM -- "-$app_pid" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$app_pid" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$app_pid" 2>/dev/null || true
  wait "$app_pid" 2>/dev/null || true
  app_pid=""
}
trap stop_app EXIT

schema_version() {
  python3 -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('PRAGMA user_version').fetchone()[0])" "$db"
}

run_upgrade() { # <label> <old launcher...> -- <install-new command> -- <new launcher...>
  local label="$1"; shift
  local old=() install=() new=()
  while [ "$1" != "--" ]; do old+=("$1"); shift; done; shift
  while [ "$1" != "--" ]; do install+=("$1"); shift; done; shift
  new=("$@")

  echo "== $label: previous release creates its state"
  rm -rf "$data_dir"
  start_app "$label-previous" "${old[@]}"
  if ! $state_db wait-created "$db" --timeout 90; then
    echo "::warning::$label: the previous release did not create its database; seeding the rc.5 schema directly"
  fi
  stop_app
  $state_db seed "$db"
  local before
  before="$(schema_version)"

  echo "== $label: install the new build over it"
  "${install[@]}"

  echo "== $label: new build opens and migrates the state"
  start_app "$label-new" "${new[@]}"
  $state_db wait-opened "$db" --version "$new_version" --timeout 90
  stop_app
  local expect_backup=()
  [ "$before" -lt 4 ] && expect_backup=(--expect-backup)
  $state_db verify "$db" --version "$new_version" "${expect_backup[@]}"
}

abs() { case "$1" in /*) echo "$1" ;; *) echo "$PWD/$1" ;; esac; }
old_deb="$(abs "$old_deb")"; new_deb="$(abs "$new_deb")"

old_pkg_version="$(dpkg-deb -f "$old_deb" Version)"
new_pkg_version="$(dpkg-deb -f "$new_deb" Version)"
echo "previous .deb $old_pkg_version -> new .deb $new_pkg_version"
if ! dpkg --compare-versions "$new_pkg_version" gt "$old_pkg_version"; then
  echo "::warning::Debian orders $new_pkg_version at or below $old_pkg_version, so 'apt install' treats this upgrade as a downgrade and needs --allow-downgrades. Document this in the release notes."
fi

$sudo_cmd apt-get install -y "$old_deb" >"$logs/apt-previous.log"
# Upgrade the way the release notes tell users to: apt resolves dependencies the new
# package adds (1.0.0 adds libayatana-appindicator3-1 for the tray), which dpkg -i alone
# does not, and --allow-downgrades covers the rc-to-stable version ordering.
run_upgrade deb /usr/bin/mag-command-center \
  -- $sudo_cmd apt-get install -y --allow-downgrades "$new_deb" \
  -- /usr/bin/mag-command-center
installed="$(dpkg-query -W -f='${Version}' mag-command-center)"
[ "$installed" = "$new_pkg_version" ] || { echo "installed $installed, expected $new_pkg_version" >&2; exit 1; }

if [ -n "$old_appimage" ] && [ -n "$new_appimage" ]; then
  old_appimage="$(abs "$old_appimage")"; new_appimage="$(abs "$new_appimage")"
  chmod +x "$old_appimage" "$new_appimage"
  export APPIMAGE_EXTRACT_AND_RUN=1
  run_upgrade appimage "$old_appimage" -- true -- "$new_appimage"
fi
echo "Linux packaged upgrade test passed."
