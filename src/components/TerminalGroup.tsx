import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { formatSshError } from '@shared/errors'
import { STORAGE } from '@shared/storage'
import RemoteTerminal from './RemoteTerminal'
import SnippetBar from './SnippetBar'

type Props = {
  sessionId: string
  cwd: string
  visible: boolean
  canBroadcast?: boolean
  onActiveShell: (shellId: string | null) => void
  onRunActive: (command: string) => void
  onRunAllShells: (command: string) => void
  onRunAllServers?: (command: string) => void
}

export default function TerminalGroup({
  sessionId,
  cwd,
  visible,
  canBroadcast,
  onActiveShell,
  onRunActive,
  onRunAllShells,
  onRunAllServers,
}: Props) {
  const [shells, setShells] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [split, setSplit] = useState(false)
  const [splitPct, setSplitPct] = useState(() => {
    const saved = Number(localStorage.getItem(STORAGE.termSplit))
    return Number.isFinite(saved) && saved >= 28 && saved <= 72 ? saved : 50
  })
  const [fontSize, setFontSize] = useState(13)
  const splitRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState('')
  const [allCmd, setAllCmd] = useState('')
  const [searchRequest, setSearchRequest] = useState(0)
  const onActiveRef = useRef(onActiveShell)
  onActiveRef.current = onActiveShell

  const addShell = useCallback(async () => {
    if (!window.barepane) return
    try {
      const id = await window.barepane.openShell(sessionId)
      setShells((current) => [...current, id])
      setActiveId(id)
      onActiveRef.current(id)
      setError('')
    } catch (err) {
      setError(formatSshError(err))
    }
  }, [sessionId])

  useEffect(() => {
    if (!window.barepane) return
    let cancelled = false
    void window.barepane
      .openShell(sessionId)
      .then((id) => {
        if (cancelled) {
          void window.barepane.closeShell(sessionId, id)
          return
        }
        setShells([id])
        setActiveId(id)
        onActiveRef.current(id)
      })
      .catch((err) => {
        if (!cancelled) setError(formatSshError(err))
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  async function closeShell(id: string) {
    if (shells.length <= 1) return
    await window.barepane.closeShell(sessionId, id)
    const next = shells.filter((item) => item !== id)
    const active = activeId === id ? next[next.length - 1] ?? null : activeId
    setShells(next)
    setActiveId(active)
    onActiveShell(active)
    if (next.length < 2) setSplit(false)
  }

  function select(id: string) {
    setActiveId(id)
    onActiveShell(id)
  }

  function runBroadcast(allServers: boolean) {
    const command = allCmd.trim()
    if (!command) return
    if (allServers) onRunAllServers?.(command)
    else onRunAllShells(command)
  }

  const splitIds = split && shells.length >= 2 ? [shells[0], shells[1]] : null

  function startSplitResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    const startY = event.clientY
    const startPct = splitPct
    const height = splitRef.current?.clientHeight ?? window.innerHeight
    const onMove = (moveEvent: MouseEvent) => {
      const delta = ((moveEvent.clientY - startY) / height) * 100
      const next = Math.min(72, Math.max(28, startPct + delta))
      setSplitPct(next)
      localStorage.setItem(STORAGE.termSplit, String(next))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Terminal</span>
        <div className="flex min-w-0 items-center gap-1">
          {shells.map((id, index) => (
            <button
              key={id}
              type="button"
              onClick={() => select(id)}
              className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] ${
                activeId === id ? 'bg-accent text-white' : 'bg-white/10 hover:bg-white/15'
              }`}
            >
              {index + 1}
              {shells.length > 1 ? (
                <span
                  className="text-white/50 hover:text-white"
                  onClick={(event) => {
                    event.stopPropagation()
                    void closeShell(id)
                  }}
                >
                  ×
                </span>
              ) : null}
            </button>
          ))}
          <button type="button" className="rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-accent" onClick={() => void addShell()}>
            +
          </button>
        </div>
        <SnippetBar
          cwd={cwd}
          canBroadcast={canBroadcast}
          onRun={onRunActive}
          onRunAllShells={onRunAllShells}
          onRunAllServers={onRunAllServers}
        />
        {shells.length > 1 ? (
          <button
            type="button"
            className={`shrink-0 rounded-md px-2 py-1 text-[11px] ${split ? 'bg-accent' : 'bg-white/10 hover:bg-accent'}`}
            onClick={() => setSplit((value) => !value)}
          >
            Split
          </button>
        ) : null}
        <button
          type="button"
          className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-accent"
          onClick={() => setFontSize((n) => Math.max(10, n - 1))}
        >
          A−
        </button>
        <button
          type="button"
          className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-accent"
          onClick={() => setFontSize((n) => Math.min(22, n + 1))}
        >
          A+
        </button>
        <button type="button" className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-accent" onClick={() => setSearchRequest((n) => n + 1)}>
          Find
        </button>
        <input
          value={allCmd}
          onChange={(event) => setAllCmd(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') runBroadcast(event.shiftKey && Boolean(canBroadcast))
          }}
          placeholder="Run on all…"
          className="h-7 w-32 shrink-0 rounded-md border border-white/10 bg-black/25 px-2 text-[11px] outline-none focus:border-accent"
        />
        <button type="button" className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-accent" onClick={() => runBroadcast(false)}>
          All shells
        </button>
        {canBroadcast ? (
          <button type="button" className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-accent" onClick={() => runBroadcast(true)}>
            All servers
          </button>
        ) : null}
      </div>
      {error ? <div className="px-3 py-1 text-xs text-red-300">{error}</div> : null}
      <div ref={splitRef} className={`min-h-0 flex-1 ${splitIds ? 'flex flex-col' : ''}`}>
        {shells.map((id) => {
          const show = splitIds ? splitIds.includes(id) : id === activeId
          const firstSplit = Boolean(splitIds && show && id === splitIds[0])
          const secondSplit = Boolean(splitIds && show && id === splitIds[1])
          return (
            <div key={id} className="contents">
              <div
                className={`min-h-0 ${
                  firstSplit ? 'overflow-hidden' : secondSplit ? 'min-h-0 flex-1 overflow-hidden' : show ? 'h-full' : 'hidden'
                }`}
                style={firstSplit ? { height: `${splitPct}%` } : undefined}
              >
                <RemoteTerminal
                  sessionId={sessionId}
                  shellId={id}
                  visible={visible && show}
                  searchRequest={show ? searchRequest : 0}
                  fontSize={fontSize}
                />
              </div>
              {firstSplit ? (
                <button
                  type="button"
                  aria-label="Resize terminals"
                  onMouseDown={startSplitResize}
                  className="h-1.5 shrink-0 cursor-row-resize bg-white/5 hover:bg-accent"
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
