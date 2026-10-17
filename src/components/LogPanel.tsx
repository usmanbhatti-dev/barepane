import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { formatSshError } from '@shared/errors'
import { LOG_PRIORITIES, parseLogDraft } from '@shared/logs'
import type { LogDraft, LogKind, LogPriority, LogScope, LogStreamInfo } from '@shared/types'

export type LogFollowRequest =
  | { id: number; kind: 'file'; path: string }
  | { id: number; kind: 'journal'; unit: string }
  | { id: number; kind: 'docker'; container: string }

type Props = {
  sessionId: string
  open: boolean
  follow?: LogFollowRequest | null
  elevate: <T>(run: (sudoPassword?: string) => Promise<T>) => Promise<T>
  onCount: (count: number) => void
  onFollowConsumed: () => void
  onClose: () => void
}

const JOURNAL_PRESETS = [
  { label: 'All', unit: '' },
  { label: 'ssh', unit: 'ssh.service' },
  { label: 'nginx', unit: 'nginx.service' },
  { label: 'docker', unit: 'docker.service' },
  { label: 'cron', unit: 'cron.service' },
]

const FILE_PRESETS = [
  { label: 'syslog', path: '/var/log/syslog' },
  { label: 'auth', path: '/var/log/auth.log' },
  { label: 'kern', path: '/var/log/kern.log' },
  { label: 'nginx error', path: '/var/log/nginx/error.log' },
  { label: 'nginx access', path: '/var/log/nginx/access.log' },
]

const MAX_CHARS = 400_000
const ANSI_RE = /\u001B\[[0-9;]*[A-Za-z]/g

type LiveLog = LogStreamInfo & {
  text: string
  ended?: string
}

function appendLog(prev: string, chunk: string): string {
  const next = prev + chunk.replace(ANSI_RE, '')
  if (next.length <= MAX_CHARS) return next
  return next.slice(next.length - Math.floor(MAX_CHARS * 0.9))
}

export default function LogPanel({
  sessionId,
  open,
  follow,
  elevate,
  onCount,
  onFollowConsumed,
  onClose,
}: Props) {
  const [kind, setKind] = useState<LogKind>('journal')
  const [scope, setScope] = useState<LogScope>('system')
  const [unit, setUnit] = useState('')
  const [priority, setPriority] = useState<LogPriority | ''>('')
  const [path, setPath] = useState('/var/log/syslog')
  const [useSudo, setUseSudo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [stick, setStick] = useState(true)
  const [streams, setStreams] = useState<LiveLog[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLPreElement | null>(null)
  const buffers = useRef(new Map<string, string>())
  const flushTimer = useRef(0)
  const streamsRef = useRef(streams)
  const startedFollow = useRef<number>(0)
  streamsRef.current = streams

  useEffect(() => {
    onCount(streams.length)
  }, [streams.length, onCount])

  useEffect(() => {
    if (!window.barepane) return
    let cancelled = false
    void window.barepane.listLogs(sessionId).then((list) => {
      if (cancelled || !list.length) return
      setStreams((current) => {
        const seen = new Set(current.map((item) => item.id))
        const extra = list.filter((item) => !seen.has(item.id)).map((item) => ({ ...item, text: '' }))
        return extra.length ? [...current, ...extra] : current
      })
      setActiveId((id) => id ?? list[0]?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    if (!window.barepane) return
    const offData = window.barepane.onLogData((id, logId, data) => {
      if (id !== sessionId) return
      buffers.current.set(logId, (buffers.current.get(logId) || '') + data)
      if (flushTimer.current) return
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = 0
        setStreams((current) =>
          current.map((item) => {
            const chunk = buffers.current.get(item.id)
            if (!chunk) return item
            buffers.current.delete(item.id)
            return { ...item, text: appendLog(item.text, chunk) }
          }),
        )
      }, 60)
    })
    const offClosed = window.barepane.onLogClosed((id, logId, reason) => {
      if (id !== sessionId) return
      setStreams((current) =>
        current.map((item) => (item.id === logId ? { ...item, ended: reason || 'stopped' } : item)),
      )
    })
    return () => {
      offData()
      offClosed()
      window.clearTimeout(flushTimer.current)
    }
  }, [sessionId])

  useEffect(() => {
    if (!follow || startedFollow.current === follow.id) return
    startedFollow.current = follow.id
    if (follow.kind === 'file') {
      setKind('file')
      setPath(follow.path)
      void begin({ kind: 'file', path: follow.path })
    } else if (follow.kind === 'journal') {
      setKind('journal')
      setUnit(follow.unit)
      void begin({ kind: 'journal', unit: follow.unit })
    } else {
      void begin({ kind: 'docker', container: follow.container })
    }
    onFollowConsumed()
    // start once per Follow click
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow?.id])

  useEffect(() => {
    if (!stick) return
    const node = scrollerRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [streams, activeId, filter, stick])

  const active = streams.find((item) => item.id === activeId) ?? streams[0] ?? null
  const visible = useMemo(() => {
    const text = active?.text || ''
    const query = filter.trim().toLowerCase()
    if (!query) return text
    return text
      .split('\n')
      .filter((line) => line.toLowerCase().includes(query))
      .join('\n')
  }, [active?.text, filter])

  async function begin(raw: LogDraft) {
    if (!window.barepane) return
    setBusy(true)
    setError('')
    try {
      const draft = parseLogDraft(raw)
      const info = await elevate((sudoPassword) =>
        window.barepane.openLog(sessionId, { ...draft, sudo: Boolean(sudoPassword) || draft.sudo }, sudoPassword),
      )
      const buffered = buffers.current.get(info.id) || ''
      buffers.current.delete(info.id)
      const next: LiveLog = { ...info, text: appendLog('', buffered) }
      setStreams((current) => [...current, next])
      setActiveId(info.id)
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setBusy(false)
    }
  }

  async function startFollow(event: FormEvent) {
    event.preventDefault()
    try {
      await begin(
        kind === 'file'
          ? { kind: 'file', path, sudo: useSudo }
          : { kind: 'journal', scope, unit: unit.trim() || undefined, priority: priority || undefined, sudo: useSudo },
      )
    } catch (err) {
      setError(formatSshError(err))
    }
  }

  async function stop(id: string) {
    try {
      await window.barepane.closeLog(sessionId, id)
    } catch {
      // already gone
    }
    setStreams((current) => current.filter((item) => item.id !== id))
    setActiveId((activeNow) => {
      if (activeNow !== id) return activeNow
      const next = streamsRef.current.filter((item) => item.id !== id)
      return next[0]?.id ?? null
    })
  }

  function onScroll() {
    const node = scrollerRef.current
    if (!node) return
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 48
    setStick(nearBottom)
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col border-l border-white/10 bg-surface shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Logs</h2>
            <p className="text-[11px] text-white/45">Follow journalctl or a file without tying up a shell</p>
          </div>
          <button type="button" className="ui-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={(event) => void startFollow(event)} className="border-b border-white/10 px-4 py-3">
          <div className="flex rounded-lg bg-black/30 p-0.5">
            {(['journal', 'file'] as LogKind[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setKind(item)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold ${
                  kind === item ? 'bg-ubuntu text-white' : 'text-white/65 hover:bg-white/8'
                }`}
              >
                {item === 'journal' ? 'Journal' : 'File'}
              </button>
            ))}
          </div>
          {kind === 'journal' ? (
            <>
              <div className="mt-2 flex flex-wrap gap-1">
                {JOURNAL_PRESETS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setUnit(item.unit)}
                    className={`rounded-md px-2 py-1 text-[11px] ${
                      unit === item.unit ? 'bg-ubuntu' : 'bg-white/10 hover:bg-white/15'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="ui-label">Scope</span>
                  <select value={scope} onChange={(event) => setScope(event.target.value as LogScope)} className="ui-input">
                    <option value="system">System</option>
                    <option value="user">User</option>
                  </select>
                </label>
                <label className="block">
                  <span className="ui-label">Unit</span>
                  <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="nginx.service" className="ui-input" />
                </label>
                <label className="block">
                  <span className="ui-label">Priority</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority((event.target.value || '') as LogPriority | '')}
                    className="ui-input"
                  >
                    <option value="">All</option>
                    {LOG_PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-1">
                {FILE_PRESETS.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => setPath(item.path)}
                    className={`rounded-md px-2 py-1 text-[11px] ${
                      path === item.path ? 'bg-ubuntu' : 'bg-white/10 hover:bg-white/15'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="mt-2 block">
                <span className="ui-label">Path</span>
                <input value={path} onChange={(event) => setPath(event.target.value)} className="ui-input font-mono text-[13px]" />
              </label>
            </>
          )}
          <label className="mt-3 flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={useSudo} onChange={(event) => setUseSudo(event.target.checked)} className="ui-check" />
            Use sudo (system logs often need this)
          </label>
          {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
          <button type="submit" disabled={busy} className="ui-btn-primary mt-3 w-full">
            {busy ? 'Starting…' : 'Follow'}
          </button>
        </form>

        {streams.length ? (
          <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2">
            {streams.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveId(item.id)}
                className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] ${
                  item.id === active?.id ? 'bg-ubuntu' : 'bg-white/10 hover:bg-white/15'
                }`}
              >
                <span className="max-w-40 truncate">{item.label}</span>
                {item.ended ? <span className="text-white/45">· stopped</span> : null}
                <span
                  className="ml-1 text-white/40 hover:text-white"
                  onClick={(event) => {
                    event.stopPropagation()
                    void stop(item.id)
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col bg-terminal">
          <pre
            ref={scrollerRef}
            onScroll={onScroll}
            className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12px] leading-5 text-white/90 whitespace-pre-wrap"
          >
            {active ? visible || (active.ended ? `Stopped: ${active.ended}` : busy ? '' : 'Waiting for log lines…') : 'Start a follow to stream logs here.'}
          </pre>
          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter lines"
              className="ui-input min-w-0 flex-1"
            />
            <button
              type="button"
              className="ui-btn"
              disabled={!active}
              onClick={() =>
                setStreams((current) => current.map((item) => (item.id === active?.id ? { ...item, text: '' } : item)))
              }
            >
              Clear
            </button>
            <button type="button" className="ui-btn" disabled={!active || Boolean(active?.ended)} onClick={() => active && void stop(active.id)}>
              Stop
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
