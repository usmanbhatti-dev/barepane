import { useEffect, useState } from 'react'
import { APP_NAME } from '@shared/brand'
import type { ExternalLinkId } from '@shared/links'
import { describeUpdate, type AppInfo } from '@shared/updates'
import { desktop, isDesktop } from '../lib/desktop'
import { useUpdateState } from '../lib/updates'

const LINKS: { id: ExternalLinkId; label: string }[] = [
  { id: 'website', label: 'Website' },
  { id: 'source', label: 'Source code' },
  { id: 'releases', label: 'Release notes' },
  { id: 'issues', label: 'Report a problem' },
  { id: 'discussions', label: 'Ask a question' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'security', label: 'Security' },
  { id: 'license', label: 'MIT license' },
]

const OS_NAMES: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

/** Version, update controls, and links. Lives at the bottom of the Help overlay. */
export default function AboutPanel() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const update = useUpdateState()

  useEffect(() => {
    if (!isDesktop()) return
    void desktop().getAppInfo().then(setInfo).catch(() => {})
  }, [])

  if (!info) return null

  const busy = update.status === 'checking' || update.status === 'downloading'
  const canCheck = update.status !== 'unsupported' && !busy

  return (
    <section aria-labelledby="about-title">
      <h3 id="about-title" className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/45">
        About
      </h3>
      <p className="mt-1 text-sm leading-6 text-white/75">
        <strong>
          {info.name} {info.version}
        </strong>{' '}
        <span className="text-white/45">
          · {OS_NAMES[info.platform] ?? info.platform} {info.arch} · Electron {info.electron}
        </span>
      </p>
      <p className="mt-1 text-sm leading-6 text-white/65">{describeUpdate(update)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="ui-btn"
          disabled={!canCheck}
          aria-busy={update.status === 'checking'}
          onClick={() => void desktop().checkForUpdates()}
        >
          Check for updates
        </button>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            className="ui-check"
            checked={info.autoCheckUpdates}
            onChange={(event) => {
              const enabled = event.target.checked
              setInfo({ ...info, autoCheckUpdates: enabled })
              void desktop().setAutoCheckUpdates(enabled).then(setInfo).catch(() => {})
            }}
          />
          Check automatically
        </label>
      </div>
      <p className="mt-2 text-xs leading-5 text-white/45">
        Update checks contact only the public release feed on GitHub. No account, no usage data. Turn the checkbox off and {APP_NAME} makes no network request on its own.
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LINKS.map((link) => (
          <li key={link.id}>
            <button type="button" className="text-accent-fg hover:text-white" onClick={() => void desktop().openExternalLink(link.id)}>
              {link.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-white/40">
        {APP_NAME} is free and open source software. Ubuntu is a registered trademark of Canonical Ltd.; {APP_NAME} is an independent project and is not affiliated with or endorsed by Canonical.
      </p>
    </section>
  )
}
