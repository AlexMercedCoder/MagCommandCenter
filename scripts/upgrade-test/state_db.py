#!/usr/bin/env python3
"""Seed and verify the Mag Command Center state database for the packaged upgrade test.

The upgrade test installs the previous release, lets it create its state database, seeds
projects, chat sessions and settings, installs the new build over it, launches it, and
then uses this script to prove that the data survived and the new build migrated it.

Subcommands:

    wait-created <db> [--timeout S]     wait until the old app has created app_state
    seed <db>                           write the fixture rows (creates schema v2 if absent)
    wait-opened <db> --version V        wait until app_meta.last_opened_version == V
    verify <db> --version V             assert fixture rows, schema, marker, and backup

Only the Python standard library is used so it runs on stock CI images.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

# Keys match src/lib/constants.ts storageKeys; chat sessions are stored per project.
PROJECT = "/home/runner/upgrade-fixture-project"
FIXTURE = {
    "mcc.project": PROJECT,
    "mcc.recentProjects": [PROJECT, "/home/runner/second-project"],
    "mcc.pinnedProjects": [PROJECT],
    f"mcc.chatSessions:{PROJECT}": [
        {
            "id": "upgrade-session-1",
            "name": "Upgrade fixture session",
            "createdAt": "2026-09-01T00:00:00.000Z",
            "updatedAt": "2026-09-01T00:05:00.000Z",
            "summary": "Created by the packaged upgrade test",
        }
    ],
    "mcc.theme": "dark",
    "mcc.upgradeFixture": {"seededBy": "scripts/upgrade-test/state_db.py", "rows": 6},
}
# Schema as 1.0.0-rc.5 and earlier created it (user_version 2).
LEGACY_SCHEMA = """
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO app_migrations(version) VALUES (1), (2);
PRAGMA user_version = 2;
"""
CURRENT_SCHEMA_VERSION = 3


def connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def table_exists(connection: sqlite3.Connection, name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return row is not None


def wait_for(predicate, timeout: float, what: str) -> None:
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            if predicate():
                return
        except sqlite3.Error as error:  # the app may hold a write lock briefly
            last_error = error
        time.sleep(0.5)
    detail = f" (last error: {last_error})" if last_error else ""
    raise SystemExit(f"timed out after {timeout:.0f}s waiting for {what}{detail}")


def cmd_wait_created(args) -> int:
    def created() -> bool:
        if not args.db.is_file():
            return False
        with connect(args.db) as connection:
            # Every release sets user_version in the same batch that creates app_state,
            # so waiting for it avoids stopping the app halfway through initialization.
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            return table_exists(connection, "app_state") and version >= 1

    wait_for(created, args.timeout, f"the previous release to create {args.db}")
    print(f"previous release created {args.db}")
    return 0


def cmd_seed(args) -> int:
    args.db.parent.mkdir(parents=True, exist_ok=True)
    with connect(args.db) as connection:
        if not table_exists(connection, "app_state"):
            print("warning: app_state missing; creating the rc.5 schema directly", file=sys.stderr)
            connection.executescript(LEGACY_SCHEMA)
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        for key, value in FIXTURE.items():
            connection.execute(
                "INSERT INTO app_state (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
                "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                (key, json.dumps(value)),
            )
    print(f"seeded {len(FIXTURE)} rows into {args.db} (schema {version})")
    return 0


def last_opened(connection: sqlite3.Connection) -> str | None:
    if not table_exists(connection, "app_meta"):
        return None
    row = connection.execute(
        "SELECT value FROM app_meta WHERE key = 'last_opened_version'"
    ).fetchone()
    return row[0] if row else None


def cmd_wait_opened(args) -> int:
    def opened() -> bool:
        with connect(args.db) as connection:
            return last_opened(connection) == args.version

    wait_for(opened, args.timeout, f"version {args.version} to open {args.db}")
    print(f"{args.version} opened and migrated {args.db}")
    return 0


def survives(expected, actual) -> bool:
    """True when the stored value still carries everything the fixture wrote.

    The app may re-save a list of records after normalizing it (adding optional fields),
    so a record list only needs each fixture record to appear as a subset of one entry.
    """
    if isinstance(expected, list) and expected and all(isinstance(i, dict) for i in expected):
        if not isinstance(actual, list):
            return False
        return all(
            any(isinstance(entry, dict) and entry.items() >= record.items() for entry in actual)
            for record in expected
        )
    return expected == actual


def cmd_verify(args) -> int:
    failures: list[str] = []
    with connect(args.db) as connection:
        stored = {
            row["key"]: json.loads(row["value_json"])
            for row in connection.execute("SELECT key, value_json FROM app_state")
        }
        for key, value in FIXTURE.items():
            if not survives(value, stored.get(key)):
                failures.append(f"{key}: expected {value!r}, found {stored.get(key)!r}")
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version != CURRENT_SCHEMA_VERSION:
            failures.append(f"user_version is {version}, expected {CURRENT_SCHEMA_VERSION}")
        migrations = {
            row[0] for row in connection.execute("SELECT version FROM app_migrations")
        }
        missing = set(range(1, CURRENT_SCHEMA_VERSION + 1)) - migrations
        if missing:
            failures.append(f"app_migrations is missing versions {sorted(missing)}")
        marker = last_opened(connection)
        if marker != args.version:
            failures.append(f"last_opened_version is {marker!r}, expected {args.version!r}")
    backups = sorted(p.name for p in args.db.parent.glob("command-center.v*.sqlite3.backup"))
    if args.expect_backup and not backups:
        failures.append("no pre-migration backup (command-center.v<N>.sqlite3.backup) was written")
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print(
        f"upgrade verified: {len(FIXTURE)} fixture rows intact, schema {version}, "
        f"opened by {args.version}, backups {backups or 'none'}"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    created = sub.add_parser("wait-created")
    created.add_argument("db", type=Path)
    created.add_argument("--timeout", type=float, default=90)
    created.set_defaults(run=cmd_wait_created)
    seed = sub.add_parser("seed")
    seed.add_argument("db", type=Path)
    seed.set_defaults(run=cmd_seed)
    opened = sub.add_parser("wait-opened")
    opened.add_argument("db", type=Path)
    opened.add_argument("--version", required=True)
    opened.add_argument("--timeout", type=float, default=90)
    opened.set_defaults(run=cmd_wait_opened)
    verify = sub.add_parser("verify")
    verify.add_argument("db", type=Path)
    verify.add_argument("--version", required=True)
    verify.add_argument("--expect-backup", action="store_true")
    verify.set_defaults(run=cmd_verify)
    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())
