#!/usr/bin/env python3
"""Compose the Tauri updater manifest (latest.json) from signed release artifacts.

Usage: latest_json.py --dir dist --version 1.0.1 --tag v1.0.1 --notes docs/RELEASE_NOTES_1.0.1.md
       [--repo owner/repo] [--out dist/latest.json]

Looks for updater packages that have a matching `.sig` file:

- linux-x86_64: *.AppImage
- windows-x86_64: *.msi (preferred) or *-setup.exe
- darwin-aarch64 / darwin-x86_64: *aarch64*.app.tar.gz / *x64*.app.tar.gz (or x86_64)

URLs point at the GitHub release asset. GitHub replaces spaces in asset names with dots,
so the URL uses that form. Exits 0 without writing anything when no signatures exist
(the build had no updater key), and 1 when signatures exist but a platform is ambiguous.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path


def asset_name(path: Path) -> str:
    return path.name.replace(" ", ".")


def pick(files: list[Path], predicate) -> Path | None:
    matches = [f for f in files if predicate(f.name) and Path(str(f) + ".sig").exists()]
    return sorted(matches)[0] if matches else None


def build(directory: Path, version: str, tag: str, repo: str, notes: str) -> dict | None:
    files = [p for p in directory.iterdir() if p.is_file() and not p.name.endswith(".sig")]
    if not any(p.name.endswith(".sig") for p in directory.iterdir()):
        return None
    candidates = {
        "linux-x86_64": pick(files, lambda n: n.endswith(".AppImage")),
        "windows-x86_64": pick(files, lambda n: n.endswith(".msi"))
        or pick(files, lambda n: n.endswith("-setup.exe")),
        "darwin-aarch64": pick(files, lambda n: n.endswith(".app.tar.gz") and "aarch64" in n),
        "darwin-x86_64": pick(
            files, lambda n: n.endswith(".app.tar.gz") and ("x64" in n or "x86_64" in n)
        ),
    }
    platforms = {}
    for platform, path in candidates.items():
        if path is None:
            continue
        signature = Path(str(path) + ".sig").read_text(encoding="utf-8").strip()
        platforms[platform] = {
            "signature": signature,
            "url": f"https://github.com/{repo}/releases/download/{tag}/{asset_name(path)}",
        }
    return {
        "version": version,
        "notes": notes,
        "pub_date": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "platforms": platforms,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--repo", default="AlexMercedCoder/MagCommandCenter")
    parser.add_argument("--notes", type=Path, help="Markdown release notes file")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    notes = args.notes.read_text(encoding="utf-8") if args.notes and args.notes.exists() else ""
    manifest = build(args.dir, args.version, args.tag, args.repo, notes)
    if manifest is None:
        print("No updater signatures found; skipping latest.json.")
        return 0
    if not manifest["platforms"]:
        print("error: signatures exist but no updater package matched", file=sys.stderr)
        return 1
    out = args.out or args.dir / "latest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} for {', '.join(sorted(manifest['platforms']))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
