# Contributing

Thanks for helping. Barepane is a free, open-source Electron desktop app. SSH and SFTP run in the main process
(`electron/main`); the UI is the renderer (`src`).

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are licensed under the
[MIT License](LICENSE).

## Ways to help that are not code

- Try it on your real servers and [report what broke](https://github.com/usmanbhatti-dev/barepane/issues/new/choose)
- Test on other distros (Debian, Rocky, Alpine, Arch) and Windows/Linux desktops, then tell us what you saw
- Improve the docs, or answer questions in [Discussions](https://github.com/usmanbhatti-dev/barepane/discussions)

## Setup

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Use the **Electron window**. The Vite localhost URL is only the renderer bundle and cannot talk to SSH.

## Checks before a PR

```bash
npm test
npm run typecheck
```

CI also runs `npm run build` and a production dependency audit.

## Layout

- `electron/main`: window, IPC, `ssh2` session, auto-updater
- `electron/preload`: `window.barepane` bridge
- `shared`: types and parsers (safe to import from both sides; no Node `Buffer`). Pure logic goes here with a `.test.ts`
- `src`: React UI
- `docs`: [testing](docs/testing.md), [releasing](docs/releasing.md), [launch plan](docs/launch-plan.md)

## Guidelines

- Do not log passwords, sudo secrets, private keys, or vault material
- Prefer SFTP for file I/O; use `sudo` only after a permission failure
- Keep renderer code free of Node APIs; go through preload, and validate every IPC argument in main
- The renderer may open only links from the allow-list in `shared/links.ts`, never arbitrary URLs
- Use the design tokens in `src/index.css` (`bg-canvas`, `bg-surface`, `bg-accent`, `text-accent-fg`), not hardcoded colors
- Changing a stored data format (saved servers, vault, snippets, tunnels)? Add a migration and a test. See [releasing](docs/releasing.md)
- No telemetry or network calls beyond the update check
- Small PRs: one feature or one fix. Add a line to `CHANGELOG.md` under `[Unreleased]`

## Commit messages

Short and imperative, ideally [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`,
`chore:`, `refactor:`, `test:`.

## Out of scope

Remote desktop (X11 / VNC / RDP), serial console, and WSL. Propose those in an issue first.
