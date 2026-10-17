# Privacy

Barepane is built to keep your servers and credentials on your computer.

## What Barepane does not do

- No account, no sign-up
- No telemetry, analytics, or usage tracking
- No crash reports sent anywhere
- Your host names, usernames, passwords, key contents, files, and terminal output are never sent to the Barepane project or to any third party. The app connects only to the servers you tell it to.

## What is stored on your computer

- Saved servers: host, user, port, and the *path* to your key file (never the key itself)
- Optional vault: SSH passwords encrypted with your master password (PBKDF2 + AES-GCM). If you forget the master password, they cannot be recovered
- Preferences: layout, bookmarks, snippets, tunnel recipes, and trusted host key fingerprints
- Sudo passwords are held in memory for the session and never written to disk

## The one network request Barepane makes by itself

**Update check.** To tell you about new versions, the app asks the project's public release feed on GitHub (`github.com/usmanbhatti-dev/barepane/releases`) whether a newer version exists. GitHub sees the request the way it sees any download (your IP address and the app version in the request). No identifier is added by Barepane.

You can turn it off in **Help (F1) → About → Check automatically**. With it off, Barepane makes no network request on its own, and you can update manually from the releases page.

## Changes

If this policy changes, it is recorded in [CHANGELOG.md](CHANGELOG.md). Questions: usmanbhatti.dev@gmail.com
