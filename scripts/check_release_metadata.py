#!/usr/bin/env python3
"""Check that every place Mag Command Center states its version agrees.

Sources compared:

- ``package.json`` ``version`` (the product version, for example ``1.0.0-rc.5``);
- ``src-tauri/tauri.conf.json`` and ``src-tauri/Cargo.toml`` (the native version, which
  maps ``-rc.N`` to ``-N`` because MSI needs a numeric prerelease);
- ``src-tauri/Cargo.lock`` (the locked crate version);
- the README ``Release:`` line, which links the current release notes;
- ``docs/RELEASE_NOTES_<version>.md`` and ``docs/RELEASE_NOTES_NEXT.md``.

Manifest disagreement is always an error. Release-notes and README drift is an error in
strict mode and a warning otherwise, so an in-progress bump on a branch does not block
work. Strict mode turns on automatically for ``refs/tags/v*`` builds (``GITHUB_REF``) and
then also requires the tag to equal ``v<package.json version>``.

Usage::

    python3 scripts/check_release_metadata.py            # advisory unless on a tag
    python3 scripts/check_release_metadata.py --strict   # what a tag build runs
    python3 scripts/check_release_metadata.py --json     # machine-readable result

Exit codes: 0 when there are no errors, 1 when there are errors, 2 for bad usage.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Report:
    strict: bool
    version: str | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def drift(self, message: str) -> None:
        (self.errors if self.strict else self.warnings).append(message)


def native_version(product_version: str) -> str:
    """Map the product version to the MSI-compatible native version."""
    return product_version.replace("-rc.", "-")


def read_toml_version(text: str, section: str = "package") -> str | None:
    in_section = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("["):
            in_section = stripped == f"[{section}]"
            continue
        if in_section:
            match = re.match(r'version\s*=\s*"([^"]+)"', stripped)
            if match:
                return match.group(1)
    return None


def read_lock_version(text: str, crate: str) -> str | None:
    match = re.search(
        rf'\[\[package\]\]\s*\nname = "{re.escape(crate)}"\s*\nversion = "([^"]+)"', text
    )
    return match.group(1) if match else None


def check(root: Path, strict: bool, tag: str | None) -> Report:
    report = Report(strict=strict)

    def load(relative: str) -> str | None:
        path = root / relative
        if not path.is_file():
            report.errors.append(f"{relative} is missing")
            return None
        return path.read_text(encoding="utf-8")

    package_text = load("package.json")
    if package_text is None:
        return report
    version = json.loads(package_text).get("version")
    if not isinstance(version, str) or not version:
        report.errors.append("package.json has no version")
        return report
    report.version = version
    expected_native = native_version(version)

    tauri_text = load("src-tauri/tauri.conf.json")
    if tauri_text is not None:
        tauri_version = json.loads(tauri_text).get("version")
        if tauri_version != expected_native:
            report.errors.append(
                f"src-tauri/tauri.conf.json version {tauri_version!r} should be "
                f"{expected_native!r} (package.json {version!r})"
            )

    cargo_text = load("src-tauri/Cargo.toml")
    if cargo_text is not None:
        cargo_version = read_toml_version(cargo_text)
        if cargo_version != expected_native:
            report.errors.append(
                f"src-tauri/Cargo.toml version {cargo_version!r} should be {expected_native!r}"
            )

    lock_text = load("src-tauri/Cargo.lock")
    if lock_text is not None:
        lock_version = read_lock_version(lock_text, "mag-command-center")
        if lock_version != expected_native:
            report.errors.append(
                f"src-tauri/Cargo.lock locks mag-command-center {lock_version!r}; "
                f"run cargo check so it records {expected_native!r}"
            )

    prerelease = expected_native.partition("-")[2]
    if prerelease and not prerelease.isdigit():
        report.errors.append(
            f"native version {expected_native!r} needs a numeric prerelease for MSI"
        )

    notes = f"docs/RELEASE_NOTES_{version}.md"
    if not (root / notes).is_file():
        report.drift(f"{notes} does not exist; write the release notes for {version}")
    if not (root / "docs/RELEASE_NOTES_NEXT.md").is_file():
        report.warnings.append(
            "docs/RELEASE_NOTES_NEXT.md is missing; unreleased changes have nowhere to go"
        )

    readme = load("README.md")
    if readme is not None:
        match = re.search(r"^Release:.*?RELEASE_NOTES_([0-9A-Za-z.\-]+)\.md", readme, re.M)
        if not match:
            report.errors.append(
                "README.md has no 'Release: [...](docs/RELEASE_NOTES_<version>.md)' line"
            )
        else:
            linked = match.group(1)
            if not (root / f"docs/RELEASE_NOTES_{linked}.md").is_file():
                report.errors.append(
                    f"README.md links docs/RELEASE_NOTES_{linked}.md, which does not exist"
                )
            if linked != version:
                report.drift(
                    f"README.md links the {linked} release notes but package.json is {version}"
                )

    if tag is not None and tag != f"v{version}":
        report.errors.append(f"tag {tag!r} does not match package.json version v{version}")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check that Mag Command Center version metadata agrees.",
        epilog="Example: python3 scripts/check_release_metadata.py --strict --tag v1.0.0",
    )
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat README and release-notes drift as errors (automatic on tag builds)",
    )
    parser.add_argument("--tag", help="release tag to compare, e.g. v1.0.0 (default: GITHUB_REF)")
    parser.add_argument("--json", action="store_true", help="print a JSON result")
    args = parser.parse_args(argv)

    github_ref = os.environ.get("GITHUB_REF", "")
    tag = args.tag
    if tag is None and github_ref.startswith("refs/tags/v"):
        tag = github_ref.removeprefix("refs/tags/")
    strict = args.strict or tag is not None

    report = check(args.root, strict, tag)
    if args.json:
        print(
            json.dumps(
                {
                    "ok": not report.errors,
                    "strict": report.strict,
                    "version": report.version,
                    "errors": report.errors,
                    "warnings": report.warnings,
                },
                indent=2,
            )
        )
    else:
        mode = "strict" if report.strict else "advisory"
        for message in report.errors:
            print(f"error: {message}", file=sys.stderr)
        for message in report.warnings:
            print(f"warning: {message}", file=sys.stderr)
        if report.errors:
            print(
                f"Release metadata check failed ({mode}); fix the errors above.",
                file=sys.stderr,
            )
        else:
            print(f"Release metadata for {report.version} is consistent ({mode}).")
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
