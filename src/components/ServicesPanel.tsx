import { useEffect, useMemo, useState } from 'react'
import { formatSshError } from '@shared/errors'
import type { ContainerAction, DockerContainer, ServiceAction, ServiceUnit } from '@shared/types'

type Tab = 'systemd' | 'docker'

type Props = {
  sessionId: string
  open: boolean
  elevate: <T>(run: (sudoPassword?: string) => Promise<T>) => Promise<T>
  onFollow: (follow: { kind: 'journal'; unit: string } | { kind: 'docker'; container: string }) => void
  onClose: () => void
}

function stateClass(active: string, sub: string): string {
  if (active === 'failed' || sub === 'failed') return 'text-red-300'
  if (active === 'active' && sub === 'running') return 'text-emerald-300'
  if (active === 'active') return 'text-sky-300'
  return 'text-white/45'
}

function dockerClass(status: string): string {
  const lower = status.toLowerCase()
  if (lower.startsWith('up')) return 'text-emerald-300'
  if (lower.includes('exited') || lower.includes('dead')) return 'text-white/45'
  if (lower.includes('restarting')) return 'text-amber-300'
  return 'text-white/70'
}

export default function ServicesPanel({ sessionId, open, elevate, onFollow, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('systemd')
  const [units, setUnits] = useState<ServiceUnit[]>([])
  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [dockerNote, setDockerNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    if (!open || !window.barepane) return
    let cancelled = false
    const load = async (quiet = false) => {
      if (document.visibilityState === 'hidden') return
      if (!quiet) setBusy(true)
      if (!quiet) setError('')
      try {
        const nextUnits = await elevate((sudoPassword) => window.barepane.listUnits(sessionId, sudoPassword))
        if (!cancelled) setUnits(nextUnits)
      } catch (err) {
        if (!cancelled && !quiet) setError(formatSshError(err))
      }
      try {
        const next = await elevate((sudoPassword) => window.barepane.listContainers(sessionId, sudoPassword))
        if (cancelled) return
        setContainers(next.items)
        setDockerNote(
          next.missing
            ? 'Docker is not installed on this server.'
            : next.daemon
              ? 'Docker is installed but the daemon is not running.'
              : next.error || '',
        )
      } catch (err) {
        if (!cancelled && !quiet) setDockerNote(formatSshError(err))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(true), 10000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, sessionId, elevate])

  const visibleUnits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return units
      .filter((unit) => (showInactive ? true : unit.active === 'active' || unit.active === 'failed'))
      .filter((unit) => !q || unit.name.toLowerCase().includes(q) || unit.description.toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (unit: ServiceUnit) => (unit.active === 'failed' ? 0 : unit.sub === 'running' ? 1 : 2)
        const diff = rank(a) - rank(b)
        return diff || a.name.localeCompare(b.name)
      })
  }, [units, query, showInactive])

  const visibleContainers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return containers.filter(
      (item) =>
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.image.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q),
    )
  }, [containers, query])

  async function runUnit(unit: string, action: ServiceAction) {
    setWorking(`${unit}:${action}`)
    setError('')
    try {
      await elevate((sudoPassword) => window.barepane.controlUnit(sessionId, unit, action, sudoPassword))
      setUnits(await elevate((sudoPassword) => window.barepane.listUnits(sessionId, sudoPassword)))
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setWorking(null)
    }
  }

  async function runContainer(name: string, action: ContainerAction) {
    setWorking(`${name}:${action}`)
    setError('')
    try {
      await elevate((sudoPassword) => window.barepane.controlContainer(sessionId, name, action, sudoPassword))
      const next = await elevate((sudoPassword) => window.barepane.listContainers(sessionId, sudoPassword))
      setContainers(next.items)
      setDockerNote(next.missing ? 'Docker is not installed on this server.' : next.daemon ? 'Docker is installed but the daemon is not running.' : next.error || '')
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setWorking(null)
    }
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-surface shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Services</h2>
            <p className="text-[11px] text-white/45">systemd units and Docker containers</p>
          </div>
          <button type="button" className="ui-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
          <div className="flex rounded-lg bg-black/30 p-0.5">
            {([
              { id: 'systemd', label: 'Systemd' },
              { id: 'docker', label: 'Docker' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                  tab === item.id ? 'bg-ubuntu text-white' : 'text-white/65 hover:bg-white/8'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter" className="ui-input min-w-0 flex-1" />
        </div>
        {tab === 'systemd' ? (
          <label className="flex items-center gap-2 px-4 py-2 text-[11px] text-white/50">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="ui-check" />
            Show inactive
          </label>
        ) : null}
        {error ? <p className="px-4 pb-2 text-sm text-red-300">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {tab === 'systemd' ? (
            visibleUnits.length ? (
              <ul className="space-y-1">
                {visibleUnits.map((unit) => (
                  <li key={unit.name} className="rounded-lg bg-white/6 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[13px]">{unit.name}</div>
                        <div className="truncate text-[11px] text-white/45">{unit.description}</div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold ${stateClass(unit.active, unit.sub)}`}>
                        {unit.sub === 'running' ? 'running' : unit.active}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {unit.sub === 'running' || unit.active === 'active' ? (
                        <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runUnit(unit.name, 'stop')}>
                          Stop
                        </button>
                      ) : (
                        <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runUnit(unit.name, 'start')}>
                          Start
                        </button>
                      )}
                      <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runUnit(unit.name, 'restart')}>
                        Restart
                      </button>
                      <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runUnit(unit.name, 'enable')}>
                        Enable
                      </button>
                      <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runUnit(unit.name, 'disable')}>
                        Disable
                      </button>
                      <button
                        type="button"
                        className="ui-btn px-2 py-0.5 text-[11px]"
                        onClick={() => onFollow({ kind: 'journal', unit: unit.name })}
                      >
                        Logs
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 pt-6 text-sm text-white/45">{busy ? 'Reading services…' : 'No matching services.'}</p>
            )
          ) : dockerNote && !containers.length ? (
            <p className="px-1 pt-6 text-sm text-white/45">{dockerNote}</p>
          ) : visibleContainers.length ? (
            <ul className="space-y-1">
              {visibleContainers.map((item) => {
                const up = item.status.toLowerCase().startsWith('up')
                return (
                  <li key={item.id} className="rounded-lg bg-white/6 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[13px]">{item.name}</div>
                        <div className="truncate text-[11px] text-white/45">{item.image}</div>
                        {item.ports ? <div className="truncate text-[11px] text-white/35">{item.ports}</div> : null}
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold ${dockerClass(item.status)}`}>{item.status}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {up ? (
                        <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runContainer(item.name, 'stop')}>
                          Stop
                        </button>
                      ) : (
                        <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runContainer(item.name, 'start')}>
                          Start
                        </button>
                      )}
                      <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runContainer(item.name, 'restart')}>
                        Restart
                      </button>
                      <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" onClick={() => onFollow({ kind: 'docker', container: item.name })}>
                        Logs
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-1 pt-6 text-sm text-white/45">{busy ? 'Reading containers…' : 'No matching containers.'}</p>
          )}
        </div>
      </aside>
    </div>
  )
}
