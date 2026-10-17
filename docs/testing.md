# Barepane — complete test plan

Use this document to verify the desktop app end to end. Work through the sections in order the first time. After a focused change, jump to the matching section plus **Disconnect and crash recovery** and **Security checks**.

This is a **Mac / Windows / Linux Electron app**. SSH runs in the desktop process. Do not treat `http://localhost:5173` as the product.

---

## 0. What you need

- Node.js 22+
- This repo: `npm install`
- At least one Ubuntu server you can SSH into (VPS or VM)
- One of: password, SSH private key (optionally encrypted), or `ssh-agent`
- Optional: a jump / bastion host, Docker on the server, a root-owned path such as `/etc` or `/var/www`

Keep a second terminal on the server (`ssh user@host`) so you can confirm remote side effects.

**Keyboard:** on macOS use ⌘; on Windows use Ctrl.

---

## 1. Automated checks (always first)

From the repo root:

```bash
npm test
npm run typecheck
```

**Pass:** all unit tests pass (the count grows over time) and there are no TypeScript errors.

Then start the app:

```bash
npm run dev
```

**Pass:** a native **Barepane** window opens (dark slate login screen with a blue Connect button). If you already had an old window open after main/preload changes, quit it and start `npm run dev` again.

---

## 2. Desktop-only gate

1. With `npm run dev` running, open `http://localhost:5173` in a **browser**.
2. **Pass:** screen titled **Barepane is a desktop app**. No connect form. Connecting is impossible.
3. Switch to the **Electron window**.
4. **Pass:** full login form with Saved servers.

---

## 3. Login — password

1. Enter host (or `user@host`), username, port `22`, password.
2. Leave **Remember this server** checked.
3. Leave **Remember password (encrypted)** unchecked for this first pass.
4. Click **Connect**.
5. **Pass:** workspace opens. Window title becomes `user@host — Barepane`. Status bar at the bottom shows hostname, OS, CPU, RAM, disk, uptime (or “Reading remote system…” then fills in).

**Fail cases to try**

- Wrong password → clear error, stay on login. Password field is not logged anywhere you can see.
- Bad host → connection error, not a crash.
- Empty host or user → validation error, no hang.

---

## 4. Login — SSH key and agent

1. Click **Disconnect** (confirm if asked) to return to login.
2. **Browse** a private key (`~/.ssh/id_ed25519` or `id_rsa`).
3. If chips appear under **Keys found**, click one; it should fill the key field. Click **Clear** and it empties.
4. Connect with key only (password empty).
5. **Pass:** same workspace as password login.

**Encrypted key**

1. Use a passphrase-protected key.
2. Enter the passphrase → connect works.
3. Leave passphrase empty with ssh-agent available → app should skip the locked file and still connect via agent or password, not hang.

**ssh-agent**

1. If the checkbox **Use ssh-agent** is shown, enable it and connect without typing a password.
2. If the checkbox is missing, `SSH_AUTH_SOCK` is not set (on Windows, Pageant is tried instead).
3. **Forward agent** (only on servers you trust): connect, then in the remote shell run `ssh-add -l` or `ssh git@github.com`. **Pass:** the remote sees your local keys. Status bar shows **Agent forwarded**.
4. OpenSSH certificates: `ssh-add` the key (with its `-cert.pub`) locally, then use the agent — no extra file picker.

---

## 5. Saved servers (no vault yet)

1. After a successful connect with **Remember this server** on, disconnect.
2. **Pass:** the server appears in the left **Saved servers** list (`name` and `user@host`).
3. Click it. Form fills (host, user, port, key **path**). Password fields stay empty.
4. Double-check local storage is not showing a raw password: saved list stores host, user, port, key path only.
5. Click **New**, fill another host, click **Save** without connecting.
6. **Pass:** it appears in the list.
7. Click **Export**. Save `barepane-servers.json`. Open it in a text editor: host, user, port, key path — **no passwords**.
8. Click **Import** and pick that file (or a copy). **Pass:** servers merge in; same `user@host:port` updates the existing row.
9. Click **Help** on the login screen (or press **F1**). **Pass:** short how-it-works, export note, agent-forward warning, shortcuts. Escape closes it. First launch with no saved servers opens Help once.

---

## 6. Master-password vault

Do this on a throwaway master password you will forget later.

1. Check **Remember password (encrypted)**.
2. If no vault exists, **Set master password** (or the create dialog opens). Use at least 8 characters. Mismatch of confirm → error. Success → vault **Unlocked**.
3. Enter an SSH password, keep Remember server + Remember password on, **Connect**.
4. Disconnect, quit the app (`⌘Q` / close window), run `npm run dev` again.
5. Click **Unlock to fill saved passwords**, enter the master password.
6. Click the saved server. **Pass:** SSH password (and key passphrase if you saved one) fill in. Badge **saved password** may show on the row.
7. **Lock** → passwords no longer auto-fill until unlock.
8. **Change** master password → unlock with the new one still works.
9. **Forget** → saved passwords gone; host/user/key path remain. Confirm you cannot recover the old secrets.

**Pass:** sudo passwords are never offered as “remember”. Vault cannot be opened with a wrong master password.

---

## 7. Jump host / bastion

Skip if you have no bastion.

1. Enable **Jump host / bastion**.
2. Fill jump host, user, port, and jump password or jump key.
3. Target host should be the inner machine (not publicly reachable).
4. **Connect**.
5. **Pass:** workspace opens on the inner host. Saved server shows **via jump**. Reconnect from the saved row still uses jump (secrets only if vault unlocked).

Wrong jump credentials → error on login, not a half-open workspace.

---

## 8. Workspace chrome and layouts

You should see:

- Top strip: server tabs (`user@host`) and **+ Server**
- Next strip: **Files / Split / Terminal**, then **Health**, **Tunnels**, **Logs**, **Services**, **Apps**, **Help**, **Disconnect**
- Bottom: status bar (host stats, health chip; later tunnel/log counts)

1. **Files** — file tree + editor, no terminal.
2. **Terminal** — full terminal, no files.
3. **Split** — both, with a drag handle between them. Drag; after reload the split width should stick (about 30–70%).
4. Layout choice should persist after disconnect + reconnect.
5. **Help** or **F1** opens the in-app guide. Escape closes it.

On macOS, traffic lights sit in the tab strip. On Windows, window buttons sit on the right of that strip. The window is draggable from the empty chrome.

---

## 9. File explorer

Start in **Split**. You should land in the remote home directory.

### Navigation

1. Sidebar **Folders** tree: **Home** is expanded. Click the **arrow** to expand or collapse without leaving the current folder. Click the **name** to open that folder in the list. Expand **/** for the whole disk (`etc`, `var`, `tmp`, …). Type in **Find folders** above the tree to filter; two letters also search the server. Escape clears.
2. Path crumbs: click a parent segment.
3. Back / forward buttons (history).
4. Toggle hidden files (dotfiles appear/disappear in the list and the tree; setting persists).
5. Refresh. A brief sync bar is OK. New folders show up in the tree.

### Browse and open

1. Open folders with Enter or double-click.
2. Open a text file (`~/.bashrc`, `/etc/hosts`, or a file you create). **Pass:** editor tab with a spinner, then content. Syntax highlighting for common types (`.sh`, `.json`, `.yml`, nginx site names under `sites-available` / `sites-enabled`).
3. Open a binary (`.png`, `.zip`, or similar). **Pass:** not treated as an editor document, or a “looks like a binary” error — no garbage in the editor.
4. Files without an extension (nginx `staging.example.com`) should still open if they are text.

### Create, rename, delete

1. Empty area → right-click → **New file** / **New folder** (or ⌘N with the pane focused).
2. Name it, confirm. It appears in the list.
3. Select a file → **F2** or right-click **Rename**.
4. Right-click **Delete** (or Del). Confirm. File gone. Open editor tab for that path should close.

### Search

1. Focus the file pane, ⌘F, type a name.
2. **Pass:** listing filters; folder search can return nested matches. Clear the query to restore the directory.

### Bookmarks

1. Right-click empty area → **Bookmark folder** (or the bookmark control).
2. It appears under **Bookmarks**. Click it to jump back.
3. Bookmark again on the same folder to remove it.
4. Bookmarks are per `user@host:port` — they must not leak onto a second server.

### Upload / download / chmod

1. Right-click a **file** → **Download**. Save locally; contents match.
2. Right-click a **folder** → **Upload here**. Pick a small local text file. It appears remotely. Drag-and-drop onto the pane should also upload.
3. Right-click → **Permissions**. Set something safe (e.g. `644` on a file you created in home). Confirm with `ls -l` in the terminal.
4. **Copy path** → paste elsewhere; it should be the remote path.

### Open in terminal / Follow log

1. Right-click a folder → **Open in terminal**. Terminal runs `cd` to that path. If you were on Files-only layout, it switches to Split.
2. Right-click a log file (or any file) → **Follow log**. Logs panel opens and tails that path.

### Sudo (root-owned paths)

1. Open `/etc` or `/var/www`. If listing fails with permission denied, enter the sudo / login password when prompted.
2. Create or save a file under a root-owned directory you are allowed to change (prefer a throwaway file). **Pass:** sudo dialog, then success. Wrong sudo password → error, retry works.
3. **Pass:** sudo password is not written to saved servers or the vault.

---

## 10. Editor

1. Open two text files. Tabs show names; dirty tab gets an orange dot after you type.
2. ⌘S saves. Status: **Saved**. Remote file matches.
3. Change again, click the tab **×**. **Pass:** unsaved confirm. Cancel keeps the tab; confirm closes it.
4. Focus the editor, ⌘W closes the tab (same unsaved prompt).
5. ⌘F opens CodeMirror find. Search / next match works.
6. Tab while editing indents; undo/redo work.
7. Save a file in `/etc` (throwaway). Sudo prompt if needed.
8. **Pass:** closing the app or Disconnect with dirty tabs asks you to confirm.

---

## 11. Terminal

1. A shell should already be open after connect. Type `whoami`, `pwd`, `hostname`. Matches the session.
2. Click **+** for a second shell. Tabs **1** / **2**. Each has its own cwd.
3. With two shells, click **Split**. Both visible. Click **Split** again to return to one.
4. You cannot close the last shell (**×** only when more than one).
5. **Jump to files** snippet runs `cd` to the file pane’s current directory.
6. Click **Find** (or ⌘F / Ctrl+F with the terminal focused). Search scrollback, Next/Prev, Escape to close. **Pass:** matches highlight; no match says so.

### Snippets

1. Click a chip (`ls -la`, `df -h`, …). Command runs in the **active** shell.
2. Right-click a chip → **Edit** / **Delete** / **Run** / **Run on all shells**.
3. **Add** a custom snippet. It persists after restart.
4. Delete a custom one; it stays gone after restart. Defaults return only if you wipe snippet storage.

### Run on all

1. Type `hostname` in **Run on all…** → **All shells**. Both local shells print it.
2. Add a second server (**+ Server**, connect). **All servers** appears.
3. Run `hostname` on all servers. **Pass:** both machines print, in every open shell.
4. Shift+Enter in that field (with two servers) also broadcasts to all servers.

---

## 12. Tunnels

Tunnels bind **127.0.0.1 only** on this computer.

1. Click **Tunnels**. Empty state explains Local / Remote / SOCKS.
2. **Local:** listen `18080`, dest `127.0.0.1:80` (or another port that exists on the server). **Add**. Count appears on the Tunnels button and status bar.
3. From your Mac/Windows: `curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080` (adjust port). You should hit the remote service, not a public bind.
4. Confirm it is not listening on `0.0.0.0` (`lsof -nP -iTCP:18080` / Resource Monitor).
5. **SOCKS:** listen e.g. `11080`. Point a browser or `curl --socks5-hostname 127.0.0.1:11080` at an internal URL if you have one.
6. **Remote** (`-R`) only if you understand the server will open a port back to you. Use a high unused port. Stop it when done.
7. **Stop** a tunnel. Count drops.
8. Disconnect and reconnect the same saved server. **Pass:** previous tunnel recipes try to reopen (skip ones that fail to bind).

Invalid port / bind in use → error in the panel, app stays up.

---

## 13. Live logs

1. **Logs**. Choose **journal**, unit preset `ssh` or `nginx`, optional priority. Follow.
2. **Pass:** lines stream. Local filter box hides non-matching lines without stopping the remote follow.
3. Follow a **file** preset (`/var/log/syslog` or `auth.log`). If permission denied, check **sudo** and retry — copy should talk about **accessing the path**, not “write here”.
4. From the file tree, **Follow log** on a file you can read. Same panel, new stream.
5. Docker: if the server has containers, follow one from Logs or from Services.
6. You can run up to **4** concurrent follows. A fifth should be refused or asked to close one.
7. Close a stream. Count on the Logs button and status bar updates.
8. Uncheck stick-to-bottom, scroll up, new lines should not yank you to the end; re-enable stick to resume.

---

## 14. VPS health

1. Click **Health** in the title bar, or any chip in the status bar (Host / CPU / RAM / Disk).
2. **Pass:** hostname, OS, kernel, addresses, uptime, load, memory, disks with percent bars, top processes.
3. A healthy VPS shows **Looks healthy**. High load, disk ≥85%, failed systemd units, or reboot-required show a warning. A red dot appears on **Health** when it is not OK.
4. If a failed service is listed, **Logs** opens the Logs panel for that unit.
5. **Refresh** updates the numbers. The status bar **Health OK / check / alert** chip matches the panel.

---

## 15. Services (systemd + Docker)

1. **Services**. **Systemd** tab lists units (active/failed first). Search filters name/description.
2. **Show inactive** reveals more units.
3. Pick a **safe** unit you may restart (e.g. a test service). Avoid `ssh` / `networking` on a live VPS unless you have console access.
4. **Start / Stop / Restart / Enable / Disable** — confirm with `systemctl status` over SSH. Sudo prompt if needed.
5. **Logs** on a unit jumps into the Logs panel for that unit.
6. **Docker** tab:
   - Installed and running → containers with start/stop/restart and jump to logs.
   - Not installed → note “Docker is not installed”, panel still usable.
   - Daemon down → note that the daemon is not running, not a hard crash of the whole panel.

---

## 15b. Apps (runtime + security)

1. **Apps**. **Pass:** panel opens once; the terminal keeps typing while it loads. There is no live refresh until you click **Refresh**.
2. **Apps** tab lists stacks, listening ports (public vs localhost), and nginx sites. **Open config** opens the site file in the editor (sudo if needed).
3. **PM2 / Compose**: if PM2 is installed, Restart / Stop / Start and **Logs** (follows the PM2 out log). Compose shows **Restart** only.
4. **Security** loads only when you open that tab. Findings are a glance (sshd, UFW, fail2ban, public ports, Let’s Encrypt). It does not change sshd or the firewall.
5. Close the panel. Status bar Health polling is unchanged. Type in the terminal — it should stay snappy.

---

## 16. Multiple SSH sessions

1. **+ Server**. Overlay login (Cancel returns to the current workspace).
2. Connect to a second host (or the same host as a second session).
3. **Pass:** two tabs in the top strip, different colors. Clicking a tab shows that server’s files/terminal. Layout and bookmarks stay per host.
4. Close a tab with **×**. Confirm disconnect. Remaining session keeps working.
5. Unsaved files on the server you close should warn you.

---

## 17. Disconnect and crash recovery

1. **Disconnect** with a dirty editor → confirm dialog. Cancel stays connected.
2. Disconnect cleanly → login (or remaining session). Status bar/session title reset when none remain.
3. Kill the remote SSH (`kill` your session from another SSH, or reboot the VPS). **Pass:** UI shows disconnected with a reason, does not freeze. You can connect again.
4. Quit the app with sessions open. Reopen. You must log in again (except filled saved servers / vault). Open tunnels from the last session are gone until reconnect recreates recipes.

---

## 18. Security checks (manual)

1. Browser tab still cannot call SSH (section 2).
2. Saved servers: no plaintext password in the sidebar or in `localStorage` key `barepane.sessions`.
3. Vault blob `barepane.vault` is ciphertext. Wrong master password fails.
4. Sudo password: used for one session in memory; Forget vault / restart does not restore it.
5. Tunnels listen on localhost only (section 12).
6. DevTools console (View menu) must not print passwords, keys, or vault material while you log in and sudo.

---

## 18b. About, updates, and links

1. Press **F1**. Scroll to **About**. **Pass:** shows `Barepane <version> · <OS> <arch> · Electron <version>`.
2. In development (`npm run dev`) the update line says updates are only checked in installed builds, and **Check for updates** is disabled. **Pass.**
3. In an **installed** build, click **Check for updates**.
   - No release published yet / offline → a plain-language message, no raw error text, no banner.
   - You are on the latest version → "You are on the latest version."
   - A newer release exists → a banner appears: **Download** (nothing restarts), then **Restart to update**. With an SSH session open, restart asks for confirmation first.
4. Untick **Check automatically**, quit, reopen. **Pass:** it stays unticked (stored in the app's `settings.json`), and no background check runs.
5. Menu **Help → Check for Updates…** shows a dialog with the result.
6. Click each link in About and the Help menu. **Pass:** each opens the right page in your normal browser. The app never navigates itself.
7. Run with `BAREPANE_DISABLE_UPDATES=1`. **Pass:** About says automatic updates are turned off.

**Update path test (first time per platform, once two releases exist):** install the *older* installer, publish the newer release,
open the old app, and follow step 3. **Pass:** it ends on the new version and saved servers are still there.

---

## 19. Packaging (optional, after UI is green)

```bash
npm run pack:mac    # macOS — .dmg in release/
npm run pack:win    # Windows — NSIS in release/
npm run pack:linux  # Linux — AppImage in release/
```

1. Install / open the artifact (unsigned Mac: right-click → Open the first time).
2. Repeat **Login (password)** and **File explorer browse** on the packaged app.
3. **Pass:** no Vite URL, no “desktop app” empty state, SSH still works.
4. Artifact names have no spaces (`Barepane-<version>-<os>-<arch>.<ext>`). Spaces break auto-update on GitHub.
5. `release/latest*.yml` exists. The updater reads it.

---

## Suggested first-pass order

| # | Area | Time (approx.) |
|---|------|----------------|
| 1 | Automated + launch | 2 min |
| 2 | Desktop-only + password login | 5 min |
| 3 | Key / agent | 5 min |
| 4 | Saved servers + vault | 10 min |
| 5 | Layout + files + editor | 15 min |
| 6 | Terminal + snippets | 10 min |
| 7 | Sudo on `/etc` | 5 min |
| 8 | Tunnels | 10 min |
| 9 | Logs + services | 10 min |
| 10 | Second server + disconnect | 5 min |

Jump host, Docker, and packaging only if those environments exist.

---

## Sign-off

Record host OS (macOS/Windows), Node version, and whether you used password, key, agent, jump, vault, Docker.

- [ ] `npm test` / `npm run typecheck`
- [ ] Electron window only (browser gated)
- [ ] Password, key, and (if present) agent login
- [ ] Saved servers without plaintext passwords
- [ ] Vault create / unlock / lock / change / forget
- [ ] Files, editor, sudo, upload/download
- [ ] Terminal find in scrollback
- [ ] Agent forwarding (optional) + export/import servers
- [ ] Help (F1) + first-run guide
- [ ] Tunnels localhost-only
- [ ] Logs + services
- [ ] VPS health panel
- [ ] Multi-session + disconnect warnings
- [ ] About shows the right version; update check behaves (section 18b)
