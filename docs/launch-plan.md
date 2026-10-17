# Barepane: Product Launch & Release Plan

Domain: **barepane.com** · App ID: `com.barepane.desktop` · Current version: `1.0.0` (never publicly released)

This is a living document. Update the "Decisions" and "Status" sections as you go. Treat it as your product notebook: every phase lists what you will *learn*, because learning from the product is a stated goal.

---

## 0. Where you are today (audit of the repo)

| Area | State | Implication |
|---|---|---|
| Product | Electron desktop app: SSH/SFTP file browser, tabbed editor, terminal, logs, systemd/Docker panel, tunnels, vault, health | Real, feature-rich. Strong v1 |
| Git | **Not a git repo** | Nothing is versioned or backed up. Do this first |
| Builds | Local unsigned `.dmg` (arm64) and `.exe` exist in `release/` | Unsigned = scary OS warnings for users |
| CI | `ci.yml` (typecheck + tests), `pack.yml` (builds artifacts on push) | No tagged releases, no publishing, no signing |
| Auto-update | **None** (no `electron-updater`) | Users can never receive your future updates. Must add before launch |
| Telemetry / crash reports | None | Good for privacy. You will need other ways to learn from users |
| Tests | ~25 unit test files in `shared/`; manual E2E in `docs/testing.md` | Good base. No automated UI test; Windows/Linux likely untested by hand |
| License | MIT, "Barepane contributors" | Anyone may fork and sell it. Decide on purpose (see Decisions) |
| Branding | Name, ID, icons exist. UI uses Ubuntu/Yaru colors (`--color-ubuntu`, `--color-aubergine`) | **Trademark risk** (Canonical owns "Ubuntu" branding) |
| `SECURITY.md` | Says "email the maintainer listed in `package.json`", but none is listed | Broken. Fix with `security@barepane.com` |
| Repo clutter | `electron-vite-react*.gif` (14 MB), `.vite.config.flat.txt`, `.playwright.config.txt`, folder named `ubuntu-gui` | Remove before first commit |

---

## 1. Decisions to make now (they are hard to undo)

1. **Open source or closed source?**
   - Recommendation: **keep the source public**. Barepane handles SSH credentials; users trust what they can inspect. It also gives you free contributors and credibility.
   - Keep your option to earn money later. Charge for *convenience* (signed builds, sync, team features, priority support), not for the core. Many tools do this (Tabby, Cyberduck donations, Obsidian).
   - If you want to keep full control, switch the license now to a source-available one (e.g. BSL/FSL) or proprietary *before* the first public release. Changing from MIT afterward does not retract versions already published under MIT.
2. **Free forever, paid, or free + Pro?** Recommendation: free at launch to collect users and feedback. Decide on monetization after about 500 active users and 3 months of feedback.
3. **Positioning.** Today the tagline says "headless Ubuntu servers". Broaden it to **"any Linux VPS"** (Debian, Rocky, Alpine) and say "Ubuntu" only descriptively. Verify the app works on Debian and Rocky before claiming it.
4. **Identity is permanent.** Keep `appId = com.barepane.desktop`. Changing it later breaks auto-update and moves user data on macOS.
5. **Telemetry policy.** Recommendation: **none at launch**, and say so loudly ("no accounts, no telemetry, credentials never leave your machine"). If you want usage data later, make it opt-in and documented.
6. **Support contact.** `hello@`, `support@`, `security@` on barepane.com.

---

## 2. Positioning & strategy

**One-liner:** *Barepane is a desktop workstation for your VPS: files, editor, and terminal in one window. Nothing gets installed on the server.*

**Real differentiator:** it is **agentless**. VS Code Remote-SSH installs a server component on the remote machine. That is heavy on a 1 GB VPS and a pain on locked-down hosts. Barepane uses plain SSH/SFTP.

**Target users (in order of priority):**
1. Solo developers and indie hackers with $5 VPS boxes (DigitalOcean, Hetzner, Contabo, AWS Lightsail)
2. Self-hosters (Docker, nginx, PM2)
3. Students and people newly moving from "GUI" to "terminal" server work
4. Freelancers who manage several client servers

**Competitors to study (and learn from):** Termius, MobaXterm, WinSCP, Tabby, Cyberduck, Transmit, Royal TSX, VS Code Remote-SSH. Make a one-page comparison of price, platforms, what is free, and what they do poorly. Your pitch lives in the gaps (simplicity, no server install, one window, VPS-specific panels like nginx/systemd/Docker/health).

**What to avoid:** competing as "another terminal". Compete as **"the calm, simple VPS workstation"**.

---

## 3. Phased plan

Rough timeline for one person working part-time: **8–10 weeks** to a public 1.0. Work in order. Each phase has an exit gate.

### Phase 1: Foundation (Week 1)
- [ ] `git init`; delete GIFs and `.txt` config leftovers; commit
- [ ] Create GitHub repo (suggest the name `barepane`, not `ubuntu-gui`); push
- [ ] Reserve names: GitHub org or user, npm `barepane`, Homebrew name, X/Twitter, Bluesky, Reddit user, YouTube handle
- [ ] **Trademark and name check:** search "Barepane" on USPTO/WIPO/IPO and the app stores for conflicts. Cheap now, painful later
- [ ] **Domain setup (no website needed):**
  - Move DNS to Cloudflare (free)
  - Email routing so `hello@`, `support@`, `security@barepane.com` forward to your inbox (Cloudflare Email Routing is free; set up a send-as alias in Gmail)
  - Add SPF, DKIM, DMARC records so your mail is not marked spam
  - Redirect `barepane.com` and `www.barepane.com` to the GitHub repo README for now. This is a redirect rule, not a website
- [ ] Fix `SECURITY.md` and `package.json` (add `author` with email, `homepage`, `repository`, `bugs`)
- [ ] Add `CHANGELOG.md` (Keep a Changelog format), `CODE_OF_CONDUCT.md`, and a Discussions tab
- [ ] Add a feature request issue template (you only have a bug template)

**Exit gate:** code is in git, email works, the domain redirects, the repo looks clean.
**You learn:** git hygiene, DNS, email deliverability.

### Phase 2: Legal & branding hygiene (Week 1–2)
- [ ] Replace Ubuntu-specific visual identity (orange/aubergine and Yaru look) with your own palette. Keep the descriptive text "works with Ubuntu servers" plus a disclaimer: *"Not affiliated with Canonical."*
- [ ] Make sure icons and fonts are your own or properly licensed. Keep a `THIRD_PARTY_LICENSES` file (generate with a license-checker tool)
- [ ] Write a short **Privacy statement** in the README: no telemetry, no accounts, what is stored locally, where
- [ ] Decide on the license (see Decisions); update `LICENSE`, `package.json`, `README`
- [ ] Add a **disclaimer** about use at your own risk (an SSH tool touches production servers)

**Exit gate:** nothing in the repo that could draw a trademark or license complaint.
**You learn:** how OSS licensing and trademarks work in practice.

### Phase 3: Product hardening (Week 2–4)
Because Barepane holds credentials and writes to production servers, quality here *is* the product.
- [ ] **Add auto-update** with `electron-updater` and a `publish` block in `electron-builder` pointing to GitHub Releases. Updates on macOS need a signed and notarized app. Add "Check for updates" in the UI and an opt-out setting
- [ ] **Test matrix** (manual first, checklist in `docs/testing.md`):
  - macOS: Apple Silicon and Intel; Windows 10/11; Ubuntu 22.04/24.04 AppImage
  - Servers: Ubuntu, Debian, Rocky/Alma, Alpine (BusyBox quirks), a server with a slow link, a server with a non-bash shell
  - Auth: password, key, `.pem`, passphrase key, agent, jump host
  - Edge cases: huge files, unicode filenames, dropped connection mid-upload, changed host key, sudo upload
- [ ] **Security review:** `npm audit`, review IPC surface, confirm no secrets in logs, confirm renderer sandbox settings, test vault with wrong password and corrupted file. Consider a short external review from a friend in security
- [ ] **Crash safety:** write unhandled errors to a local log file that users can attach to an issue ("Help → Open logs folder"). No remote upload
- [ ] **First-run experience:** a clear first screen, a sample "how to connect" guide, readable error messages (you already have `shared/errors.ts`)
- [ ] **Accessibility and polish:** keyboard navigation, scaling at 125–150% on Windows, dark mode only is fine if stated
- [ ] Add Playwright/Electron smoke test to CI (launch app, assert window opens). It does not need a server. Optionally run a Dockerized `openssh-server` in CI for real SFTP tests
- [ ] Performance check on a cheap 1 GB VPS (memory usage of remote commands, polling interval of the health panel)

**Exit gate:** you can use Barepane for a full week on your own servers without hitting a blocking bug, and the checklist passes on all three OSes.
**You learn:** cross-platform testing, security thinking, update mechanics.

### Phase 4: Signing, packaging, release pipeline (Week 3–5)
**Code signing (the biggest trust factor):**
- **macOS:** join Apple Developer Program ($99/yr). Create a Developer ID Application certificate, enable hardened runtime and notarization in `electron-builder` (remove `identity: null`, add entitlements, add notarize credentials as CI secrets). Without this, users must right-click → Open and many will bounce
- **Windows:** options, in order of cost: (a) SignPath Foundation (free for open-source projects), (b) Azure Trusted Signing (about $10/month; check eligibility for your country and entity type), (c) an OV/EV certificate from a CA (roughly $200–400/yr). Unsigned works but shows SmartScreen "Unknown publisher"; reputation builds slowly
- **Linux:** AppImage needs no signing. Publish a SHA-256 checksum file. Add a `.deb` target later

**Release pipeline (replace the current `pack.yml`):**
- [ ] `release.yml` triggered by tags `v*.*.*`
- [ ] Matrix build on macOS / Windows / Ubuntu, sign, notarize, and upload to a **draft** GitHub Release
- [ ] Generate `SHA256SUMS.txt` and the auto-update metadata (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`)
- [ ] Build both macOS architectures (arm64 and x64; locally only arm64 exists today) and Windows x64 (arm64 later)
- [ ] Keep secrets only in GitHub Actions secrets; never commit certificates
- [ ] Dependabot already exists. Add `npm audit` to CI and pin the Node version

**Versioning rules (Semantic Versioning):**
- `MAJOR.MINOR.PATCH`. Patch = bug fixes; Minor = new features, backward-compatible; Major = breaking changes to stored data
- Release as **`0.9.0-beta.1`**, then `0.9.x`, then `1.0.0`. The first public version being a beta lowers expectations and protects your reputation
- **Stored data formats** (saved servers, vault, snippets) must be versioned and migrated. Write a migration test for each format change before you ever ship a change to `shared/storage.ts` or `shared/vault.ts`

**Exit gate:** pushing a tag produces signed, notarized installers on a draft release, and an older build updates itself to the newer one.
**You learn:** certificates, notarization, CI/CD, update channels.

### Phase 5: Private beta (Week 5–7)
- [ ] Pick **15–30 testers** from: friends, Reddit (r/selfhosted, r/homelab, r/vps, r/sysadmin), Discord/Telegram dev communities, Twitter/X, Upwork/other freelancers you know
- [ ] Give them the beta build, a feedback form (Google Form or GitHub Discussions), and 2–3 specific tasks to test ("connect, edit nginx file, restart a service, upload with sudo")
- [ ] Run for 2 weeks. Fix every crash and every confusing screen. Triage: *blocker / important / nice-to-have*
- [ ] Use a "how did you feel" question: *"What would you have to do if Barepane disappeared tomorrow?"* This tells you how essential it is
- [ ] Record 3–5 users doing the first-time setup (with permission); watching is the best learning you will get

**Exit gate:** no open blockers, at least 5 testers say they would keep using it.
**You learn:** user research, prioritization.

### Phase 6: Launch assets (Week 6–8, overlaps with the beta)
You said no website for now, so **the GitHub README is your landing page**.
- [ ] README: hero screenshot, 20–40 second demo GIF/MP4, 3 bullet "why", download buttons per OS, quick start, FAQ, privacy line, "Not affiliated with Canonical"
- [ ] 6–8 clean screenshots (light and dark if both exist) and a 60–90 second demo video (YouTube unlisted/public)
- [ ] Social preview image for the GitHub repo (1280×640)
- [ ] Short launch post drafts: Show HN, Reddit, X thread, Product Hunt, dev.to
- [ ] Press kit folder in the repo (`/brand`: logo SVG/PNG, colors, screenshots)
- [ ] Roadmap issue or pinned Discussion so users see where it is going
- [ ] Support policy page in README: where to ask, response time, what is out of scope

**Later (not now): the website.** When ready, a one-page static site on Cloudflare Pages or GitHub Pages is enough: hero, demo, download, docs, changelog, privacy. The domain redirect then switches from the repo to the site. Do not build it before the product has users asking.

### Phase 7: Public launch (Week 8–10)
**Release day checklist**
- [ ] Final tag `v1.0.0` → draft release → verify each installer on a clean machine (fresh macOS user, fresh Windows VM, fresh Ubuntu VM)
- [ ] Verify auto-update from the last beta to 1.0.0
- [ ] Check all download links, checksum file, README, and email inbox
- [ ] Publish the release
- [ ] Announce (below)

**Launch sequence (spread over about one week; do not spam everything at once):**
| Day | Channel | Notes |
|---|---|---|
| Tue–Thu, morning US/EU time | **Show HN** ("Show HN: Barepane, an agentless desktop workstation for your VPS") | Be present in the comments for 6–8 hours. Be honest about limits |
| Same day or next | **Reddit**: r/selfhosted, r/sysadmin, r/vps, r/commandline, r/webdev (read each sub's self-promo rules first) | Lead with the problem, not the product |
| Day 2–3 | X/Twitter, Bluesky, LinkedIn thread with demo GIF | |
| Day 3–5 | dev.to / Hashnode write-up: "Why I built a GUI for VPS work" | Story posts keep working for months |
| Week 2 | **Product Hunt** (prepare assets, pick a launch day, line up supporters) | Optional; good for visibility, weak for sysadmins |
| Week 2–4 | Submit to: AlternativeTo, awesome-selfhosted style lists, Homebrew cask, winget, Scoop, Flathub/Snap, AUR (community) | Package managers give a trickle that compounds |

**Distribution channels (priority):** GitHub Releases (primary) → Homebrew cask → winget → AppImage plus Flathub → Snap/AUR if community asks. Skip the Mac App Store and Microsoft Store at first (sandboxing makes SSH key access awkward, and review cycles slow you down).

**Day-of rules:** reply to every comment/issue within 24 hours for the first two weeks; keep a hotfix lane open (patch release in under 48 hours for any data-loss or security bug).

---

## 4. Ongoing release process (for every future update)

**Branching:** trunk-based. `main` is always releasable. Short feature branches and PRs. No long-lived branches.

**Cadence:** patch releases as needed, a minor release every **4–6 weeks** with a short changelog. Predictability builds trust.

**Release checklist for every version**
1. Update `CHANGELOG.md` (Added / Changed / Fixed / Security)
2. Bump version (`npm version minor|patch`)
3. CI green (typecheck, tests, audit)
4. Run the manual smoke checklist (`docs/testing.md`) on at least one machine per OS
5. Tag `vX.Y.Z` → CI builds, signs, notarizes → draft release
6. Install the draft on a clean machine, test auto-update from the previous version
7. **Beta channel first:** publish as pre-release (`-beta.N`) for 3–7 days to opt-in users. Then promote to stable
8. Publish; post short release notes (GitHub, social); update package managers (Homebrew/winget PRs are often automatable)
9. Watch issues for 48 hours; be ready to pull the release (mark as pre-release and stop auto-update propagation) if something is broken

**Rollback plan:** keep the previous installers available. If a bad release goes out, publish a fixed patch immediately (auto-update will always move users forward, so "fix forward" is the realistic rollback). Never delete a published version without a reason in the changelog.

**Data safety rule:** any release that changes stored files must (a) migrate old data, (b) back up the old file before migrating, and (c) have a test. Corrupting users' saved servers or vault is the one unforgivable bug.

**Security response:** acknowledge reports within 72 hours; fix and release a patch; credit the reporter; publish a short advisory using GitHub Security Advisories.

---

## 5. Post-launch product strategy

**How to learn from users with zero telemetry**
- GitHub release download counts, stars, issue themes, Discussions
- A "Help → Send feedback" button that opens a prefilled GitHub issue or an email
- Monthly 20-minute calls with 2–3 active users
- Optional newsletter or release-notes email list (a simple form posting to an email tool; announce the privacy handling)
- A public roadmap and a feature voting thread

**Roadmap themes (pick from user feedback, not guesses)**
- Reliability: reconnect on drop, resume uploads, large-file handling
- Workflow: SSH config import (you already have `sshConfig`), multi-server run, server groups/folders, saved layouts
- VPS operations: backups helper, firewall (ufw) view, cron view, certificate (Let's Encrypt) status, Docker Compose view
- Platform: Windows ARM, Linux `.deb`, themes, localization
- Editor: remote diff, file history, multi-cursor extras

**Monetization options (decide later, after real usage)**
| Model | Fit | Notes |
|---|---|---|
| Donations/GitHub Sponsors | Low effort | Small, but a good first signal |
| One-time license for Pro features (about $29–49) | Good for desktop tools | Needs a license key check; keep it offline-friendly |
| Subscription for sync and team vault | Higher revenue | Requires a backend, security burden, and support. Delay until demand is clear |
| Paid, signed convenience builds, free source | Compatible with open source | Some projects do this |

**Metrics to track (monthly):** downloads per OS, update adoption (percent on latest version, via GitHub release asset requests), stars, open issues vs closed, median issue response time, number of contributors, number of paying users (if any).

---

## 6. Budget (approximate, per year)

| Item | Cost |
|---|---|
| Domain (already bought) | done |
| Apple Developer Program | $99 |
| Windows signing | $0 (SignPath OSS) to about $120 (Azure Trusted Signing) to about $300+ (CA certificate) |
| Email (Cloudflare routing) | $0 |
| Hosting for redirect or future static site | $0 (Cloudflare/GitHub Pages) |
| GitHub, CI minutes (public repo) | $0 |
| Trademark filing (optional, later) | varies by country |
| **Total to start** | **about $100–$400** |

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Unsigned installers scare users | Apple notarization before launch; Windows signing; publish checksums; explain clearly in README until signed |
| Data loss or vault corruption | Versioned formats, migrations with backups, tests, beta channel |
| Security bug in an SSH tool | Security review before launch, `SECURITY.md`, fast patch lane, advisories |
| Trademark complaint (Ubuntu) | Own palette and identity; descriptive use only; disclaimer |
| Name conflict with "Barepane" | Search before investing in branding; consider filing a trademark |
| Burnout / lost momentum | Fixed cadence, small releases, public roadmap, a private "done" list |
| Low discoverability | Focus on 2–3 communities, repeat story posts, package managers, comparison pages later |
| Big competitors (Termius, VS Code) | Stay in the niche: agentless, simple, VPS-specific panels |

---

## 8. Learning log (use this to learn from the product)

Keep `docs/journal.md` and add one entry per week: what you shipped, what surprised you, what you would do differently.

| Phase | Skill you gain |
|---|---|
| 1–2 | Git, DNS, email, licensing, trademarks |
| 3 | Cross-platform testing, security thinking, data migrations |
| 4 | Code signing, notarization, CI/CD, auto-update |
| 5 | User research, prioritization |
| 6–7 | Positioning, writing, launch marketing |
| Ongoing | Support, roadmapping, pricing, community |

---

## 9. Immediate next 10 actions (this week)

1. Decide: open source vs. closed (recommendation: public, with a monetization path later)
2. Delete clutter (GIFs and `.txt` config leftovers); `git init`; first commit
3. Create the GitHub repo named `barepane`; push
4. Point barepane.com DNS to Cloudflare; set up email forwarding for `hello@`, `support@`, `security@`
5. Redirect barepane.com to the GitHub repo
6. Fix `SECURITY.md` and `package.json` metadata (author, email, repository, homepage, bugs)
7. Run a trademark and name conflict search for "Barepane"
8. Enroll in the Apple Developer Program (approval can take days)
9. Apply for free Windows signing (SignPath Foundation) or evaluate Azure Trusted Signing
10. Write the first journal entry and set up the public roadmap issue

---

## Status tracker

- [ ] Phase 1: Foundation
- [ ] Phase 2: Legal & branding hygiene
- [ ] Phase 3: Product hardening
- [ ] Phase 4: Signing & release pipeline
- [ ] Phase 5: Private beta
- [ ] Phase 6: Launch assets
- [ ] Phase 7: Public launch
