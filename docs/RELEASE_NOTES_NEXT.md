# Next Mag Command Center release

Unreleased. Changes after 1.0.0 go here until the next release is cut.

## Fixed

- Release `SHA256SUMS` now names files the way GitHub publishes them (spaces become dots), so
  `sha256sum -c SHA256SUMS --ignore-missing` works on downloaded installers. The 1.0.0 release's
  `SHA256SUMS` asset was corrected by hand after publishing; the hashes did not change.
