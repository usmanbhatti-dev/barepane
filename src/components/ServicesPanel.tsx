import { useEffect, useMemo, useState } from 'react'
import { formatSshError } from '@shared/errors'
import type {
  ContainerAction,
  DockerContainer,
  DockerImage,
  DockerInspect,
  DockerVolume,
  ServiceAction,
  ServiceUnit,
} from '@shared/types'

type Tab = 'systemd' | 'docker'
type DockerView = 'containers' | 'images' | 'volumes'

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
  const [dockerView, setDockerView] = useState<DockerView>('containers')
  const [units, setUnits] = useState<ServiceUnit[]>([])
  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [images, setImages] = useState<DockerImage[]>([])
  const [volumes, setVolumes] = useState<DockerVolume[]>([])
  const [dockerNote, setDockerNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [openName, setOpenName] = useState<string | null>(null)
  const [inspect, setInspect] = useState<Record<string, DockerInspect>>({})
  const [inspectBusy, setInspectBusy] = useState<string | null>(null)

  useEffect(() => {
    setUnits([])
    setContainers([])
    setImages([])
    setVolumes([])
    setDockerNote('')
    setError('')
    setOpenName(null)
    setInspect({})
  }, [sessionId])

  useEffect(() => {
    if (!open || !window.barepane || tab !== 'systemd') return
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
  }, [open, tab, sessionId, elevate])

  useEffect(() => {
    if (!open || !window.barepane || tab !== 'docker') return
    let cancelled = false
    const load = async () => {
      if (document.visibilityState === 'hidden') return
      setBusy(true)
      setError('')
      try {
        const next = await elevate((sudoPassword) => window.barepane.getDockerInventory(sessionId, sudoPassword))
        if (cancelled) return
        setContainers(next.containers)
        setImages(next.images)
        setVolumes(next.volumes)
        setDockerNote(
          next.missing
            ? 'Docker is not installed on this server.'
            : next.daemon
              ? 'Docker is installed but the daemon is not running.'
              : next.error || '',
        )
      } catch (err) {
        if (!cancelled) setDockerNote(formatSshError(err))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, tab, sessionId, elevate])

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

  const visibleImages = useMemo(() => {
    const q = query.trim().toLowerCase()
    return images.filter(
      (item) => !q || item.repository.toLowerCase().includes(q) || item.tag.toLowerCase().includes(q) || item.id.includes(q),
    )
  }, [images, query])

  const visibleVolumes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return volumes.filter(
      (item) => !q || item.name.toLowerCase().includes(q) || item.mountpoint.toLowerCase().includes(q),
    )
  }, [volumes, query])

  async function refreshDocker() {
    setBusy(true)
    setError('')
    try {
      const next = await elevate((sudoPassword) => window.barepane.getDockerInventory(sessionId, sudoPassword))
      setContainers(next.containers)
      setImages(next.images)
      setVolumes(next.volumes)
      setDockerNote(
        next.missing
          ? 'Docker is not installed on this server.'
          : next.daemon
            ? 'Docker is installed but the daemon is not running.'
            : next.error || '',
      )
    } catch (err) {
      setDockerNote(formatSshError(err))
    } finally {
      setBusy(false)
    }
  }

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
      await refreshDocker()
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setWorking(null)
    }
  }

  async function loadInspect(name: string) {
    setInspectBusy(name)
    setError('')
    try {
      const next = await elevate((sudoPassword) => window.barepane.inspectContainer(sessionId, name, sudoPassword))
      setInspect((current) => ({ ...current, [name]: next }))
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setInspectBusy(null)
    }
  }

  function toggleContainer(name: string) {
    if (openName === name) {
      setOpenName(null)
      return
    }
    setOpenName(name)
    if (!inspect[name]) void loadInspect(name)
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
            <p className="text-[11px] text-white/45">
              {tab === 'docker' ? 'On demand — Refresh to snapshot Docker' : 'systemd units and Docker containers'}
            </p>
          </div>
          <div className="flex gap-2">
            {tab === 'docker' ? (
              <button type="button" className="ui-btn" disabled={busy} onClick={() => void refreshDocker()}>
                {busy ? 'Reading…' : 'Refresh'}
              </button>
            ) : null}
            <button type="button" className="ui-btn" onClick={onClose}>
              Close
            </button>
          </div>
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
                  tab === item.id ? 'bg-accent text-white' : 'text-white/65 hover:bg-white/8'
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
        ) : (
          <div className="flex gap-1 border-b border-white/10 px-4 py-2">
            {([
              { id: 'containers', label: `Containers ${containers.length ? containers.length : ''}` },
              { id: 'images', label: `Images ${images.length ? images.length : ''}` },
              { id: 'volumes', label: `Volumes ${volumes.length ? volumes.length : ''}` },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDockerView(item.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                  dockerView === item.id ? 'bg-accent text-white' : 'text-white/60 hover:bg-white/8'
                }`}
              >
                {item.label.trim()}
              </button>
            ))}
          </div>
        )}
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
          ) : dockerNote && !containers.length && !images.length && !volumes.length ? (
            <p className="px-1 pt-6 text-sm text-white/45">{dockerNote}</p>
          ) : dockerView === 'containers' ? (
            visibleContainers.length ? (
              <ul className="space-y-1">
                {visibleContainers.map((item) => {
                  const up = item.status.toLowerCase().startsWith('up')
                  const detail = inspect[item.name]
                  const expanded = openName === item.name
                  return (
                    <li key={item.id} className="rounded-lg bg-white/6 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" className="min-w-0 text-left" onClick={() => toggleContainer(item.name)}>
                          <div className="truncate font-mono text-[13px]">{item.name}</div>
                          <div className="truncate text-[11px] text-white/45">{item.image}</div>
                          {item.ports ? <div className="truncate text-[11px] text-white/35">{item.ports}</div> : null}
                        </button>
                        <span className={`shrink-0 text-[11px] font-semibold ${dockerClass(item.status)}`}>{item.status}</span>
                      </div>
                      {expanded ? (
                        <div className="mt-2 rounded-md bg-black/25 px-2 py-1.5 text-[11px] text-white/65">
                          {inspectBusy === item.name && !detail ? (
                            <p>Reading limits…</p>
                          ) : detail ? (
                            <div className="space-y-0.5">
                              <div>CPU limit {detail.cpuLimit}</div>
                              <div>Memory limit {detail.memoryLimit}</div>
                              {detail.cpuPercent ? (
                                <div>
                                  Now {detail.cpuPercent} CPU
                                  {detail.memoryUsage ? ` · ${detail.memoryUsage}` : ''}
                                  {detail.memoryPercent ? ` (${detail.memoryPercent})` : ''}
                                </div>
                              ) : (
                                <div className="text-white/40">Live usage only while the container is running.</div>
                              )}
                              <button
                                type="button"
                                className="mt-1 text-accent hover:text-white"
                                disabled={inspectBusy === item.name}
                                onClick={() => void loadInspect(item.name)}
                              >
                                {inspectBusy === item.name ? 'Reading…' : 'Refresh stats'}
                              </button>
                            </div>
                          ) : (
                            <p>Could not read inspect for this container.</p>
                          )}
                        </div>
                      ) : null}
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
            )
          ) : dockerView === 'images' ? (
            visibleImages.length ? (
              <ul className="space-y-1">
                {visibleImages.map((item) => (
                  <li key={`${item.id}-${item.repository}-${item.tag}`} className="rounded-lg bg-white/6 px-3 py-2">
                    <div className="truncate font-mono text-[13px]">
                      {item.repository}:{item.tag}
                    </div>
                    <div className="text-[11px] text-white/45">
                      {item.id} · {item.size}
                      {item.created ? ` · ${item.created}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 pt-6 text-sm text-white/45">{busy ? 'Reading images…' : 'No matching images.'}</p>
            )
          ) : visibleVolumes.length ? (
            <ul className="space-y-1">
              {visibleVolumes.map((item) => (
                <li key={item.name} className="rounded-lg bg-white/6 px-3 py-2">
                  <div className="truncate font-mono text-[13px]">{item.name}</div>
                  <div className="truncate text-[11px] text-white/45">{item.driver}</div>
                  {item.mountpoint ? <div className="truncate font-mono text-[11px] text-white/35">{item.mountpoint}</div> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 pt-6 text-sm text-white/45">{busy ? 'Reading volumes…' : 'No matching volumes.'}</p>
          )}
        </div>
      </aside>
    </div>
  )
}
