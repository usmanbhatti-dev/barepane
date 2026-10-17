# Changelog

All notable changes to Barepane are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.0] - Unreleased

First public beta. Barepane is a desktop workstation for your Linux VPS: files, editor, and a real terminal over plain
SSH, with nothing installed on the server.

### Added
- Update checks through GitHub Releases. Nothing downloads or restarts without a click, and it asks first when SSH
  sessions are open. Turn background checks off in **Help (F1) → About**
- About panel (version, platform, update controls, links) and a **Help** menu in the application menu
- Release pipeline: pushing a `vX.Y.Z` tag builds macOS (arm64, x64), Windows (x64), and Linux (x64, arm64)
  installers into a draft GitHub release with `SHA256SUMS.txt`
- macOS `.zip` build (required for auto-update) alongside the `.dmg`
- `PRIVACY.md`, `CODE_OF_CONDUCT.md`, feature request template, release runbook, and launch plan

### Changed
- New neutral Barepane look (slate and blue), a new app icon, and a new terminal and editor color theme. The previous
  Ubuntu-branded colors are gone
- Positioned for any Linux VPS, not only Ubuntu
- Installer file names now follow `Barepane-<version>-<os>-<arch>.<ext>` with no spaces
- `SECURITY.md` now has working contact options and a response timeline

### Security
- External links open only from a fixed allow-list in the app, never from arbitrary text
- Electron fuses: the installed app can no longer be run as a Node interpreter (`ELECTRON_RUN_AS_NODE`), ignores
  `NODE_OPTIONS`, and only loads code from its integrity-checked archive
- Production dependency audit and CodeQL code scanning run in CI
- A dropped connection can no longer trigger Electron's raw crash dialog, and a crashed window offers to reload

### Notes
- Windows and Linux builds are newer and less tested than macOS. Reports are welcome
- Early builds may be unsigned, so your OS may show a warning on first launch
