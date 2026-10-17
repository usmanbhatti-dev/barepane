# Contributing

Thanks for helping. This is an Electron desktop app. SSH and SFTP run in the main process (`electron/main`); the UI is the renderer (`src`).

## Setup

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

## Layout

- `electron/main` — window, IPC, `ssh2` session
- `electron/preload` — `window.barepane` bridge
- `shared` — types and parsers (safe to import from both sides; no Node `Buffer`)
- `src` — React UI

## Guidelines

- Do not log passwords, sudo secrets, private keys, or vault material
- Prefer SFTP for file I/O; use `sudo` only after a permission failure
- Keep renderer code free of Node APIs; go through preload
- Match existing Ubuntu/Yaru colors (`--color-ubuntu`, `--color-aubergine`, `--color-surface`)
- Small PRs: one feature or one fix

## Out of scope

Remote desktop (X11 / VNC / RDP), serial console, and WSL. Propose those in an issue first.
