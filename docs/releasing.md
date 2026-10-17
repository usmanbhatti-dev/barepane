# Releasing Barepane

This is the runbook. Follow it top to bottom for every release. The pipeline lives in
[`.github/workflows/release.yml`](../.github/workflows/release.yml).

## How a release works

```text
bump version + changelog  →  git tag vX.Y.Z  →  push tag
        →  GitHub Actions builds macOS / Windows / Linux (x64 + arm64)
        →  uploads installers + update metadata to a DRAFT release
        →  you test the draft  →  press "Publish release"
        →  installed apps see the new version and offer the update
```

Nothing is public until you press **Publish**. A draft is your last safety net.

## Versioning

[Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

| Change | Bump | Example |
|---|---|---|
| Bug fix, no new behaviour | patch | `1.0.0` → `1.0.1` |
| New feature, backward compatible | minor | `1.0.1` → `1.1.0` |
| Breaks saved data or workflows | major | `1.4.0` → `2.0.0` |
| Pre-release for testers | suffix | `1.1.0-beta.1`, `1.1.0-beta.2` |

Beta versions (anything with `-`) are published as **pre-releases**. Apps on a beta stay on the beta channel;
stable installs never receive pre-releases.

## Rules that protect your users

1. **Never break stored data.** Saved servers, snippets, tunnels and the vault live in `localStorage`
   (`shared/storage.ts`, `shared/vault.ts`). If a release changes their format: migrate old data, keep the old
   value until the migration succeeded, and add a test. Losing someone's saved servers is the one unforgivable bug.
2. **Never auto-restart.** The updater downloads only after a click and restarts only after a click (with a warning
   when SSH sessions are open). Keep it that way.
3. **No telemetry.** If that ever changes it must be opt-in and written in `PRIVACY.md` first.
4. **Do not delete a published release.** Ship a fixed patch instead. Auto-update only moves forward.

## One-time setup (do these once)

### 1. GitHub repository

```bash
# create an empty PUBLIC repo named "barepane" on github.com (no README, no license), then:
git remote add origin git@github.com:usmanbhatti-dev/barepane.git
git push -u origin main
```

Then in the repo **Settings**:

- **Security → Private vulnerability reporting**: enable (referenced by `SECURITY.md`)
- **Security → Dependabot alerts / security updates**: enable
- **General → Features**: enable **Discussions** (linked from the app and issue chooser)
- **Branches → Add rule for `main`**: require the `check` status to pass before merging
- **Actions → General → Workflow permissions**: *Read and write* (release workflow needs it)

### 2. Domain and email (barepane.com)

1. Add the domain to Cloudflare (free) and switch the nameservers at your registrar.
2. **Email Routing**: create `hello@`, `support@`, `security@` forwarding to your inbox.
3. In Gmail, add a "Send mail as" alias so you can reply from `hello@barepane.com`.
4. DNS records Cloudflare suggests for email (SPF, DKIM, DMARC `p=none` to start).
5. **Redirect** (Rules → Redirect Rules): `barepane.com/*` and `www.barepane.com/*` →
   `https://github.com/usmanbhatti-dev/barepane`, status 302. This is not a website; it just gives the domain
   a useful destination until you build one.
6. After email works, replace `usmanbhatti.dev@gmail.com` in `SECURITY.md`, `PRIVACY.md`,
   `CODE_OF_CONDUCT.md` and `package.json` with `security@` / `hello@barepane.com`.

### 3. Code signing (strongly recommended before a public launch)

Unsigned apps work, but macOS Gatekeeper and Windows SmartScreen warn users, and **auto-update on macOS requires a
signed app**. Until you sign, users must update manually from the releases page (the app shows that button).

**macOS (Apple Developer Program, $99/year):**

1. Enroll at developer.apple.com/programs (can take a day or two).
2. Xcode or developer.apple.com → create a **Developer ID Application** certificate. Export it from Keychain as
   a `.p12` with a password.
3. Create an **app-specific password** at appleid.apple.com. Note your **Team ID**.
4. Add repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|---|---|
| `CSC_LINK` | the `.p12` file, base64: `base64 -i cert.p12 \| pbcopy` |
| `CSC_KEY_PASSWORD` | the `.p12` password |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | your 10-character team id |

The workflow notices these and signs + notarizes automatically. No workflow edits needed.

**Windows (pick one):**

- **SignPath Foundation**: free for open-source projects. Apply at signpath.org. Needs a workflow step added.
- **Azure Trusted Signing**: about $10/month; check eligibility for your country and account type.
- **A certificate (`.pfx`) from a CA**: about $200–400/year. Add `WIN_CSC_LINK` (base64 `.pfx`) and
  `WIN_CSC_KEY_PASSWORD` secrets; no workflow edits needed.

Without any of these the Windows installer is unsigned and SmartScreen shows "Unknown publisher" until it builds
reputation. That is acceptable for a beta.

**Linux:** AppImage needs no signing. Checksums are published as `SHA256SUMS.txt`.

## Every release

### 1. Prepare

```bash
git switch main && git pull
npm ci
npm run typecheck && npm test && npm run audit:prod
```

- Move the `[Unreleased]` entries in `CHANGELOG.md` under a new heading `## [X.Y.Z] - YYYY-MM-DD`.
- Update the compare links if you keep them.
- Run the manual checklist in [`docs/testing.md`](testing.md) on at least one machine per OS you can reach
  (focus on sections that your changes touched, plus **Disconnect and crash recovery** and **Security checks**).

### 2. Version and tag

```bash
npm version 1.0.0 --no-git-tag-version      # or: patch | minor | 1.1.0-beta.1
git add -A && git commit -m "chore(release): v1.0.0"
git tag v1.0.0
git push origin main --tags
```

The workflow refuses to run if the tag does not match `package.json`, or `CHANGELOG.md` has no section for the version.

### 3. Watch the build

GitHub → **Actions → Release**. Jobs: `verify` → `draft` → `build` (4 platforms) → `checksums`. If one platform
fails, fix forward: delete the tag (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`), delete the *draft*,
fix, and tag again. Drafts are private, so this is safe.

### 4. Test the draft

Download the installers from the draft release **on clean machines or fresh user accounts**:

- [ ] macOS: opens (right-click → Open if unsigned), connects, edits a file, About shows the right version
- [ ] Windows: installer runs, app starts, connects
- [ ] Linux: `chmod +x Barepane-*.AppImage && ./Barepane-*.AppImage`
- [ ] `shasum -a 256` of each download matches `SHA256SUMS.txt`
- [ ] **Update test** (after the first release): install the *previous* version, publish the new release,
  open the old app → Help → Check for updates → Download → Restart. It should land on the new version.

### 5. Publish

Edit the draft: tidy the generated notes (lead with what users care about), keep **Pre-release** ticked for betas,
then **Publish release**. Installed apps pick it up within 12 hours or when users click **Check for updates**.

### 6. Announce and watch

- Post the release notes where your users are (see `docs/launch-plan.md`).
- Watch issues and Discussions closely for 48 hours.
- If something is badly broken: publish a patch release quickly. Do not delete the bad one.

## Hotfix (security or data-loss bug)

1. Branch from the released tag, fix, add a test.
2. Bump the **patch** version, changelog entry under `### Security` or `### Fixed`.
3. Tag and publish as above, skipping the beta stage.
4. For security issues: publish a GitHub Security Advisory and credit the reporter.

## Local test builds

```bash
npm run pack:mac       # .dmg + .zip in release/ (ad-hoc signed, never published)
npm run pack:win       # NSIS installer
npm run pack:linux     # AppImage x64
npm run pack:linux:arm64
npm run icons          # regenerate icons from public/icon.svg
```

`BAREPANE_DISABLE_UPDATES=1` turns the update check off for a run.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Release workflow fails at `verify` | Tag and `package.json` version differ, or the changelog has no section for the version |
| Three draft releases appear | Should not happen (the `draft` job creates it once). Delete extras, keep the one with assets |
| macOS app "is damaged" | Unsigned + quarantined. Right-click → Open, or `xattr -dr com.apple.quarantine /Applications/Barepane.app`, or sign the app |
| macOS app is killed instantly ("Code Signature Invalid") | Electron fuses edit the binary, which breaks its signature. Unsigned builds must be ad-hoc signed (`-c.mac.identity=-`, already set in `pack:mac` and the release workflow). Never use `identity=null` |
| Auto-update does nothing on macOS | App is unsigned (updates need a signature). Use the releases page, or add signing secrets |
| Auto-update 404 | The release is still a draft. Publish it |
| Linux says updates unsupported | Only the AppImage can self-update; `.deb`/extracted builds cannot |
