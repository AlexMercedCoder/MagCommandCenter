"""Tests for updater/latest_json.py. Run: python3 -m unittest discover -s scripts"""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "latest_json", Path(__file__).resolve().parent / "updater" / "latest_json.py"
)
latest_json = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(latest_json)


class LatestJsonTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def touch(self, name, sig=None):
        (self.dir / name).write_text("x")
        if sig is not None:
            (self.dir / (name + ".sig")).write_text(sig)

    def test_skips_when_the_build_had_no_updater_key(self):
        self.touch("Mag Command Center_1.0.1_amd64.AppImage")
        self.assertEqual(latest_json.main(["--dir", str(self.dir), "--version", "1.0.1", "--tag", "v1.0.1"]), 0)
        self.assertFalse((self.dir / "latest.json").exists())

    def test_builds_platform_entries_with_github_asset_urls(self):
        self.touch("Mag Command Center_1.0.1_amd64.AppImage", "sigA")
        self.touch("Mag Command Center_1.0.1_x64_en-US.msi", "sigW")
        self.touch("Mag Command Center_1.0.1_x64-setup.exe", "sigN")
        self.touch("Mag Command Center_aarch64.app.tar.gz", "sigM")
        self.touch("Mag Command Center_1.0.1_amd64.deb")
        self.assertEqual(
            latest_json.main(["--dir", str(self.dir), "--version", "1.0.1", "--tag", "v1.0.1"]), 0
        )
        manifest = json.loads((self.dir / "latest.json").read_text())
        self.assertEqual(manifest["version"], "1.0.1")
        self.assertEqual(
            sorted(manifest["platforms"]), ["darwin-aarch64", "linux-x86_64", "windows-x86_64"]
        )
        windows = manifest["platforms"]["windows-x86_64"]
        self.assertEqual(windows["signature"], "sigW")
        self.assertEqual(
            windows["url"],
            "https://github.com/AlexMercedCoder/MagCommandCenter/releases/download/v1.0.1/"
            "Mag.Command.Center_1.0.1_x64_en-US.msi",
        )

    def test_fails_when_signatures_match_no_known_package(self):
        self.touch("notes.txt", "sig")
        self.assertEqual(latest_json.main(["--dir", str(self.dir), "--version", "1", "--tag", "v1"]), 1)


if __name__ == "__main__":
    unittest.main()
