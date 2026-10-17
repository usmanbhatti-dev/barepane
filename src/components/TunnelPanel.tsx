import { useState, type FormEvent } from 'react'
import { formatSshError } from '@shared/errors'
import { parseTunnelDraft, tunnelLabel } from '@shared/tunnels'
import type { TunnelDraft, TunnelInfo, TunnelKind } from '@shared/types'

type Props = {
  tunnels: TunnelInfo[]
  open: boolean
  busy?: boolean
  error?: string
  onClose: () => void
  onAdd: (draft: TunnelDraft) => Promise<void>
  onStop: (id: string) => Promise<void>
}

const KINDS: { id: TunnelKind; label: string }[] = [
  { id: 'local', label: 'Local' },
  { id: 'remote', label: 'Remote' },
  { id: 'socks', label: 'SOCKS' },
]

const RECIPES: { label: string; draft: TunnelDraft }[] = [
  { label: 'MySQL 3306', draft: { kind: 'local', listenPort: 3306, destHost: '127.0.0.1', destPort: 3306 } },
  { label: 'Postgres 5432', draft: { kind: 'local', listenPort: 5432, destHost: '127.0.0.1', destPort: 5432 } },
  { label: 'Redis 6379', draft: { kind: 'local', listenPort: 6379, destHost: '127.0.0.1', destPort: 6379 } },
  { label: 'SOCKS 1080', draft: { kind: 'socks', listenPort: 1080 } },
  { label: 'Grafana 3000', draft: { kind: 'local', listenPort: 3000, destHost: '127.0.0.1', destPort: 3000 } },
  { label: 'Prometheus 9090', draft: { kind: 'local', listenPort: 9090, destHost: '127.0.0.1', destPort: 9090 } },
]

export default function TunnelPanel({ tunnels, open, busy, error, onClose, onAdd, onStop }: Props) {
  const [kind, setKind] = useState<TunnelKind>('local')
  const [listenPort, setListenPort] = useState('3306')
  const [destHost, setDestHost] = useState('127.0.0.1')
  const [destPort, setDestPort] = useState('3306')
  const [formError, setFormError] = useState('')

  async function addTunnel(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    try {
      await onAdd(
        parseTunnelDraft({
          kind,
          listenPort,
          destHost,
          destPort,
        }),
      )
    } catch (err) {
      setFormError(formatSshError(err))
    }
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Tunnels</h2>
            <p className="text-[11px] text-white/45">Listen on 127.0.0.1 on this computer</p>
          </div>
          <button type="button" className="ui-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tunnels.length ? (
            <ul className="mb-4 space-y-1">
              {tunnels.map((tunnel) => (
                <li key={tunnel.id} className="flex items-center gap-2 rounded-lg bg-white/6 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{tunnelLabel(tunnel)}</span>
                  <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => void onStop(tunnel.id)}>
                    Stop
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-white/45">No tunnels yet. Local is ssh -L, remote is -R, SOCKS is -D.</p>
          )}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {RECIPES.map((recipe) => (
              <button
                key={recipe.label}
                type="button"
                disabled={busy}
                className="rounded-md bg-white/8 px-2 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/12 hover:text-white disabled:opacity-40"
                onClick={() => {
                  setKind(recipe.draft.kind)
                  setListenPort(String(recipe.draft.listenPort))
                  setDestHost(recipe.draft.destHost || '127.0.0.1')
                  setDestPort(String(recipe.draft.destPort || recipe.draft.listenPort))
                  void onAdd(recipe.draft).catch((err) => setFormError(formatSshError(err)))
                }}
              >
                {recipe.label}
              </button>
            ))}
          </div>
          <form onSubmit={(event) => void addTunnel(event)} className="grid grid-cols-2 gap-2">
            <div className="col-span-2 flex rounded-lg bg-black/30 p-0.5">
              {KINDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKind(item.id)}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold ${
                    kind === item.id ? 'bg-ubuntu text-white' : 'text-white/65 hover:bg-white/8'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="ui-label">Listen port</span>
              <input value={listenPort} onChange={(event) => setListenPort(event.target.value)} className="ui-input" inputMode="numeric" />
            </label>
            {kind === 'socks' ? (
              <p className="flex items-end pb-2 text-[11px] leading-4 text-white/40">Dynamic SOCKS5 on localhost</p>
            ) : (
              <label className="block">
                <span className="ui-label">{kind === 'remote' ? 'Local dest port' : 'Remote dest port'}</span>
                <input value={destPort} onChange={(event) => setDestPort(event.target.value)} className="ui-input" inputMode="numeric" />
              </label>
            )}
            {kind !== 'socks' ? (
              <label className="col-span-2 block">
                <span className="ui-label">{kind === 'remote' ? 'Local dest host' : 'Remote dest host'}</span>
                <input value={destHost} onChange={(event) => setDestHost(event.target.value)} className="ui-input" placeholder="127.0.0.1" />
              </label>
            ) : null}
            {formError || error ? <p className="col-span-2 text-sm text-red-300">{formError || error}</p> : null}
            <button type="submit" disabled={busy} className="ui-btn-primary col-span-2">
              {busy ? 'Opening…' : 'Start tunnel'}
            </button>
          </form>
        </div>
      </aside>
    </div>
  )
}
