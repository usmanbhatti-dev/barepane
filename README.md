# Barepane

Desktop app for managing a headless Ubuntu VPS over SSH: file browser, tabbed editor, and a real terminal — no VNC or GNOME required.

This is a **Mac, Windows, and Linux desktop application**. It is not a website. SSH runs in the Electron main process.

## Why this exists

Most cheap VPS images have no desktop. You SSH in and work in a terminal. Barepane gives you a local workstation window: browse `/etc` and `/var/www`, edit nginx site files (including names like `staging.example.com`), upload with sudo when the folder is root-owned, and keep an SSH shell beside the files.

## Features

- Password, SSH key (including AWS `.pem`), and `ssh-agent` login (including agent forwarding; OpenSSH certificates via the agent)
- First-connect host key check (fingerprint saved on this computer; changed keys are blocked unless you replace them)
- Saved servers (host, user, key path). Export/import the list between computers. Optional master-password vault for login passwords
- Multiple SSH connections in tabs
- Optional jump host / bastion
- Local, remote, and SOCKS port forwarding (localhost only)
- Multiple shells per server, split view, run-on-all
- Saved command snippets (click to run, right-click to edit)
- Live logs: follow journalctl, a file, or a Docker container
- Systemd and Docker panel (start / stop / restart, jump to logs)
- Split layout: files only, terminal only, or both
- Tabbed editor with syntax highlighting, save, and sudo retry
- SFTP upload / download with progress, chmod, bookmarks, name search, and search inside files
- Terminal find in scrollback (⌘F / Ctrl+F)
- In-app Help (F1)
- Site actions: test nginx, reload nginx or PHP-FPM, open `sites-enabled`
- Editor warns if the remote file changed while it was open
- VPS health: load, memory, disks, failed services, top processes
- Apps snapshot (on demand): listening ports, process stacks, nginx sites, PM2 start/stop/restart + logs, Compose restart, security glance
- Remote stats in the status bar

## Requirements

- macOS, Windows, or Linux (AppImage)
- Node.js 22+ for development

## Develop

```bash
npm install
npm run dev
```

Use the **Electron window**. Do not open the Vite URL in a browser — SSH is not available there.

End-to-end manual checks: [docs/testing.md](docs/testing.md).

```bash
npm test
npm run typecheck
```

## Package

```bash
npm run pack:mac    # .dmg in release/
npm run pack:win    # NSIS installer in release/
npm run pack:linux  # AppImage in release/
```

Unsigned builds: on macOS, right-click the app → Open the first time.

## Security

- Passwords and sudo prompts stay in memory for the session unless you unlock a master-password vault
- Host, user, port, and key *path* may be remembered without a vault
- Saved SSH passwords are encrypted (PBKDF2 + AES-GCM) on this computer; they cannot be recovered if the master password is lost
- File writes to system folders use `sudo` only after you confirm

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
