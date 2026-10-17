# Security

Barepane talks to your servers with the credentials you enter. Treat it like any SSH client.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

1. Preferred: use [GitHub private vulnerability reporting](https://github.com/usmanbhatti-dev/barepane/security/advisories/new).
2. Or email **usmanbhatti.dev@gmail.com** with the subject `Barepane security`.

Please include the version (Help (F1) → About, or the file name you downloaded), your OS, and steps to reproduce.

What to expect:

- Acknowledgement within **72 hours**.
- A fix or a clear plan within **14 days** for confirmed issues, faster for credential exposure or data loss.
- Credit in the release notes and the advisory, unless you prefer to stay anonymous.

## Supported versions

Only the **latest release** receives security fixes. The app checks for updates; please keep it current.

## Rules of thumb

- Never persist SSH passwords, sudo passwords, or private key material in plaintext. Saved servers store host, user, port, and key *path* only. An optional master-password vault may keep SSH passwords encrypted on this computer (PBKDF2 + AES-GCM). Sudo passwords stay in memory.
- Port forwards listen on localhost (`127.0.0.1`) only
- Agent forwarding is off unless you turn it on; only enable it on servers you trust
- IPC is accepted only from the app window
- The renderer is sandboxed: no Node, no `nodeIntegration`, navigation and new windows are blocked
- Assume the remote user is unprivileged; elevation is explicit sudo
- There is no telemetry and no account. The only network traffic the app creates on its own is the update check (see [PRIVACY.md](PRIVACY.md))

## Verifying downloads

Each release includes a `SHA256SUMS.txt`. Compare it with your download:

```bash
shasum -a 256 Barepane-*.dmg        # macOS / Linux
Get-FileHash .\Barepane-*-win-x64.exe  # Windows PowerShell
```
