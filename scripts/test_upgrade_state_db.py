"""Tests for upgrade-test/state_db.py. Run: python3 -m unittest discover -s scripts"""

import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "state_db", Path(__file__).resolve().parent / "upgrade-test" / "state_db.py"
)
state_db = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(state_db)


def migrate_like_the_new_app(db: Path, version: str) -> None:
    """Mirror open_state_database + record_state_open in src-tauri/src/lib.rs."""
    backup = db.parent / "command-center.v2.sqlite3.backup"
    backup.write_bytes(db.read_bytes())
    with sqlite3.connect(db) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            INSERT OR IGNORE INTO app_migrations(version) VALUES (1), (2), (3);
            PRAGMA user_version = 3;
            """
        )
        connection.execute(
            "INSERT INTO app_meta (key, value) VALUES ('last_opened_version', ?)", (version,)
        )


class StateDbTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db = Path(self.directory.name) / "command-center.sqlite3"

    def tearDown(self):
        self.directory.cleanup()

    def test_seeded_state_verifies_after_a_migration(self):
        self.assertEqual(state_db.main(["seed", str(self.db)]), 0)
        migrate_like_the_new_app(self.db, "1.0.0")
        self.assertEqual(
            state_db.main(["verify", str(self.db), "--version", "1.0.0", "--expect-backup"]), 0
        )

    def test_unmigrated_or_lost_state_fails_verification(self):
        state_db.main(["seed", str(self.db)])
        self.assertEqual(state_db.main(["verify", str(self.db), "--version", "1.0.0"]), 1)
        migrate_like_the_new_app(self.db, "1.0.0")
        with sqlite3.connect(self.db) as connection:
            connection.execute("DELETE FROM app_state WHERE key = 'mcc.pinnedProjects'")
        self.assertEqual(state_db.main(["verify", str(self.db), "--version", "1.0.0"]), 1)

    def test_normalized_session_records_still_count_as_surviving(self):
        expected = [{"id": "a", "name": "A"}]
        self.assertTrue(state_db.survives(expected, [{"id": "a", "name": "A", "extra": 1}]))
        self.assertFalse(state_db.survives(expected, [{"id": "b", "name": "A"}]))
        self.assertFalse(state_db.survives(expected, None))


if __name__ == "__main__":
    unittest.main()
