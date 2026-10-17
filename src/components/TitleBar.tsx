import { useState } from 'react'
import { SITE_ACTIONS, SITES_ENABLED, siteActionLabel } from '@shared/sites'
import type { ConnectResult, SiteAction } from '@shared/types'

export type LayoutMode = 'files' | 'split' | 'terminal'

type Props = {
  session: ConnectResult
  layout: LayoutMode
  tunnelCount?: number
  logCount?: number
  onLayoutChange: (layout: LayoutMode) => void
  onTunnels: () => void
  onLogs: () => void
  onServices: () => void
  onApps: () => void
  onHealth: () => void
  onHelp: () => void
  onSiteAction: (action: SiteAction) => void
  onOpenSites: () => void
  onDisconnect: () => void
  healthLevel?: 'ok' | 'warn' | 'bad'
}

const LAYOUTS: { id: LayoutMode; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'split', label: 'Split' },
  { id: 'terminal', label: 'Terminal' },
]

export default function TitleBar({
  session,
  layout,
  tunnelCount = 0,
  logCount = 0,
  onLayoutChange,
  onTunnels,
  onLogs,
  onServices,
  onApps,
  onHealth,
  onHelp,
  onSiteAction,
  onOpenSites,
  onDisconnect,
  healthLevel = 'ok',
}: Props) {
  const [siteOpen, setSiteOpen] = useState(false)
  const label = `${session.username}@${session.host}:${session.port}`
  return (
    <header
      aria-label={label}
      className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-aubergine px-3"
    >
      <div className="flex rounded-lg bg-black/30 p-0.5" role="group" aria-label="Layout">
        {LAYOUTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onLayoutChange(item.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              layout === item.id ? 'bg-ubuntu text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onHealth} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white">
          {healthLevel !== 'ok' ? (
            <span
              className={`h-1.5 w-1.5 rounded-full ${healthLevel === 'bad' ? 'bg-red-400' : 'bg-amber-400'}`}
              aria-hidden
            />
          ) : null}
          Health
        </button>
        <button type="button" onClick={onTunnels} className="rounded-md px-2.5 py-1 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white">
          Tunnels{tunnelCount ? ` ${tunnelCount}` : ''}
        </button>
        <button type="button" onClick={onLogs} className="rounded-md px-2.5 py-1 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white">
          Logs{logCount ? ` ${logCount}` : ''}
        </button>
        <button type="button" onClick={onServices} className="rounded-md px-2.5 py-1 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white">
          Services
        </button>
        <button type="button" onClick={onApps} className="rounded-md px-2.5 py-1 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white">
          Apps
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSiteOpen((open) => !open)}
            className="rounded-md px-2.5 py-1 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white"
          >
            Site
          </button>
          {siteOpen ? (
            <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-white/10 bg-[#2a2a2a] py-1 shadow-xl">
              {SITE_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
                  onClick={() => {
                    setSiteOpen(false)
                    onSiteAction(action)
                  }}
                >
                  {siteActionLabel(action)}
                </button>
              ))}
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
                onClick={() => {
                  setSiteOpen(false)
                  onOpenSites()
                }}
              >
                Open {SITES_ENABLED}
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onHelp} className="rounded-md px-2.5 py-1 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white">
          Help
        </button>
        <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
        <button
          type="button"
          onClick={onDisconnect}
          className="rounded-md px-2.5 py-1 text-xs font-semibold text-white/70 hover:bg-danger hover:text-white"
        >
          Disconnect
        </button>
      </div>
    </header>
  )
}
