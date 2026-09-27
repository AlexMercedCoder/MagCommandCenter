"""Tests for check_release_metadata.py. Run: python3 -m unittest discover -s scripts"""

import json
import shutil
import tempfile
import unittest
from pathlib import Path

import check_release_metadata as checker

REPO = Path(__file__).resolve().parent.parent


class ReleaseMetadataTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        for relative in (
            "package.json",
            "README.md",
            "src-tauri/tauri.conf.json",
            "src-tauri/Cargo.toml",
            "src-tauri/Cargo.lock",
        ):
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(REPO / relative, target)
        (self.root / "docs").mkdir()
        for notes in (REPO / "docs").glob("RELEASE_NOTES_*.md"):
            shutil.copy(notes, self.root / "docs" / notes.name)
        self.version = json.loads((REPO / "package.json").read_text())["version"]

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_repository_is_consistent_in_strict_mode(self):
        report = checker.check(self.root, strict=True, tag=f"v{self.version}")
        self.assertEqual(report.errors, [])

    def test_manifest_drift_is_always_an_error(self):
        path = self.root / "src-tauri/tauri.conf.json"
        config = json.loads(path.read_text())
        config["version"] = "0.0.1"
        path.write_text(json.dumps(config))
        report = checker.check(self.root, strict=False, tag=None)
        self.assertTrue(any("tauri.conf.json" in error for error in report.errors))

    def test_stale_readme_release_line_is_advisory_on_branches_and_fatal_on_tags(self):
        readme = self.root / "README.md"
        text = readme.read_text()
        older = sorted(
            p.stem.removeprefix("RELEASE_NOTES_")
            for p in (self.root / "docs").glob("RELEASE_NOTES_1.0.0-rc.*.md")
            if p.stem != f"RELEASE_NOTES_{self.version}"
        )[0]
        readme.write_text(text.replace(f"RELEASE_NOTES_{self.version}.md", f"RELEASE_NOTES_{older}.md"))
        advisory = checker.check(self.root, strict=False, tag=None)
        self.assertEqual(advisory.errors, [])
        self.assertTrue(any("README.md links" in item for item in advisory.warnings))
        strict = checker.check(self.root, strict=True, tag=f"v{self.version}")
        self.assertTrue(any("README.md links" in item for item in strict.errors))

    def test_tag_must_match_the_product_version(self):
        report = checker.check(self.root, strict=True, tag="v9.9.9")
        self.assertTrue(any("tag 'v9.9.9'" in error for error in report.errors))

    def test_missing_release_notes_fail_a_tag_build(self):
        (self.root / f"docs/RELEASE_NOTES_{self.version}.md").unlink()
        report = checker.check(self.root, strict=True, tag=f"v{self.version}")
        self.assertTrue(report.errors)


if __name__ == "__main__":
    unittest.main()
