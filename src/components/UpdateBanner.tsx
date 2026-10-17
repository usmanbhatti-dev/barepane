import { useState } from 'react'
import { APP_NAME } from '@shared/brand'
import { describeUpdate, shouldShowBanner } from '@shared/updates'
import { desktop } from '../lib/desktop'
import { useUpdateState } from '../lib/updates'

/** Small, dismissible notice. Never installs anything without a click. */
export default function UpdateBanner() {
  const state = useUpdateState()
  const [dismissed, setDismissed] = useState('')
  const key = `${state.status}:${state.version ?? ''}`

  if (!shouldShowBanner(state) || dismissed === key) return null

  const percent = Math.max(0, Math.min(100, Math.round(state.percent ?? 0)))

  return (
    <div
      className="fixed bottom-10 right-4 z-[80] w-80 rounded-xl border border-white/10 bg-surface p-3 shadow-2xl"
      role="status"
      aria-live="polite"
    >
      <div className="text-sm font-semibold">
        {state.status === 'available' ? `${APP_NAME} ${state.version} is available` : null}
        {state.status === 'downloading' ? `Downloading ${APP_NAME} ${state.version}` : null}
        {state.status === 'ready' ? `${APP_NAME} ${state.version} is ready to install` : null}
        {state.status === 'error' ? 'Update problem' : null}
      </div>
      <p className="mt-1 text-xs leading-5 text-white/60">
        {state.status === 'available' ? 'Download it now. Nothing changes until you restart.' : null}
        {state.status === 'downloading' ? describeUpdate(state) : null}
        {state.status === 'ready' ? 'Restarting closes open SSH sessions, so finish what you are doing first.' : null}
        {state.status === 'error' ? describeUpdate(state) : null}
      </p>
      {state.status === 'downloading' ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {state.status === 'available' ? (
          <button type="button" className="ui-btn-primary px-3 py-1.5 text-xs" onClick={() => void desktop().downloadUpdate()}>
            Download
          </button>
        ) : null}
        {state.status === 'ready' ? (
          <button type="button" className="ui-btn-primary px-3 py-1.5 text-xs" onClick={() => void desktop().installUpdate()}>
            Restart to update
          </button>
        ) : null}
        {state.status === 'available' || state.status === 'ready' || state.status === 'error' ? (
          <button type="button" className="ui-btn px-3 py-1.5 text-xs" onClick={() => void desktop().openExternalLink('releases')}>
            {state.status === 'error' ? 'Releases page' : 'Release notes'}
          </button>
        ) : null}
        {state.status !== 'downloading' ? (
          <button type="button" className="ui-btn px-3 py-1.5 text-xs" onClick={() => setDismissed(key)}>
            {state.status === 'error' ? 'Dismiss' : 'Later'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
