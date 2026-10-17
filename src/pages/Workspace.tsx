import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { formatSshError } from '@shared/errors'
import { assessHealth } from '@shared/health'
import { shellQuote } from '@shared/paths'
import { SITES_ENABLED } from '@shared/sites'
import { STORAGE } from '@shared/storage'
import type { ConnectResult, RemoteFile, ServerStats, SiteAction, TransferProgress, TunnelDraft, TunnelInfo } from '@shared/types'
import EditorTabs, { type EditorTab } from '../components/EditorTabs'
import FileDialog from '../components/FileDialog'
import FileExplorer from '../components/FileExplorer'
import TerminalGroup from '../components/TerminalGroup'
import LogPanel, { type LogFollowRequest } from '../components/LogPanel'
import ServicesPanel from '../components/ServicesPanel'
import StatusBar, { type Notice } from '../components/StatusBar'
import TitleBar, { type LayoutMode } from '../components/TitleBar'
import TunnelPanel from '../components/TunnelPanel'
import HelpOverlay, { useHelpHotkey } from '../components/HelpOverlay'
import HealthPanel from '../components/HealthPanel'
import RuntimePanel from '../components/RuntimePanel'
import TransferBar from '../components/TransferBar'
import CommandPalette, { type PaletteCommand } from '../components/CommandPalette'
import { looksBinary } from '../lib/files'
import { cacheFor } from '../lib/remoteCache'
import { runWithSudo } from '../lib/sudoRetry'
import { loadTunnelRecipes, saveTunnelRecipes } from '../lib/tunnelStore'

const SPLIT_KEY = STORAGE.split
const EDITOR_SPLIT_KEY = STORAGE.editorSplit
const LAYOUT_KEY = STORAGE.layout

type Props = {
  session: ConnectResult
  canBroadcast?: boolean
  active?: boolean
  onBroadcast?: (command: string) => void
  onDisconnect: () => void
}

function readLayout(): LayoutMode {
  const saved = localStorage.getItem(LAYOUT_KEY)
  if (saved === 'files' || saved === 'split' || saved === 'terminal') return saved
  return 'split'
}

export default function Workspace({ session, canBroadcast, active = true, onBroadcast, onDisconnect }: Props) {
  const cache = cacheFor(session.id)
  const tunnelScope = `${session.username}@${session.host}:${session.port}`
  const [leftPct, setLeftPct] = useState(() => {
    const saved = Number(localStorage.getItem(SPLIT_KEY))
    return Number.isFinite(saved) && saved >= 30 && saved <= 70 ? saved : 50
  })
  const [editorPct, setEditorPct] = useState(() => {
    const saved = Number(localStorage.getItem(EDITOR_SPLIT_KEY))
    return Number.isFinite(saved) && saved >= 28 && saved <= 68 ? saved : 44
  })
  const filesColumnRef = useRef<HTMLElement | null>(null)
  const [layout, setLayout] = useState<LayoutMode>(readLayout)
  const [cwd, setCwd] = useState(session.home)
  const [stats, setStats] = useState<ServerStats | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [resizing, setResizing] = useState(false)
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const tabsRef = useRef(tabs)
  const sudoPasswordRef = useRef<string | null>(null)
  const [sudoPrompt, setSudoPrompt] = useState<{ error: string; resolve: (value: string | null) => void } | null>(null)
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([])
  const [showTunnels, setShowTunnels] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [showServices, setShowServices] = useState(false)
  const [showHealth, setShowHealth] = useState(false)
  const [showApps, setShowApps] = useState(false)
  const [healthError, setHealthError] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  useHelpHotkey(showHelp, () => setShowHelp(true), () => setShowHelp(false), active)
  const [logCount, setLogCount] = useState(0)
  const [logFollow, setLogFollow] = useState<LogFollowRequest | null>(null)
  const logFollowSeq = useRef(0)
  const [tunnelBusy, setTunnelBusy] = useState(false)
  const [tunnelError, setTunnelError] = useState('')
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const activeShellRef = useRef<string | null>(null)
  tabsRef.current = tabs

  const sendCommand = useCallback((command: string) => {
    const shellId = activeShellRef.current
    if (shellId) window.barepane.writeTerminal(session.id, shellId, `${command}\n`)
  }, [session.id])

  const flash = useCallback((text: string, kind: Notice['kind'] = 'info') => {
    setNotice({ text, kind })
  }, [])

  const askSudo = useCallback((error: string) => {
    return new Promise<string | null>((resolve) => {
      setSudoPrompt({ error, resolve })
    })
  }, [])

  const elevate = useCallback(<T,>(run: (sudoPassword?: string) => Promise<T>) => {
    return runWithSudo(run, askSudo, sudoPasswordRef)
  }, [askSudo])

  const changeLayout = useCallback((next: LayoutMode) => {
    setLayout(next)
    localStorage.setItem(LAYOUT_KEY, next)
  }, [])

  useEffect(() => {
    if (!active) return
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setShowPalette((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const refreshStats = useCallback(async (full = false) => {
    try {
      const next = full ? await window.barepane.getHealth(session.id) : await window.barepane.getStats(session.id)
      setStats(next)
      setHealthError('')
    } catch (err) {
      setHealthError(formatSshError(err))
    }
  }, [session.id])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    return window.barepane.onTransfer((id, transfer) => {
      if (id !== session.id) return
      setTransfers((current) => {
        const next = current.filter((item) => item.id !== transfer.id)
        return [...next, transfer]
      })
      if (transfer.status !== 'running') {
        window.setTimeout(() => {
          setTransfers((current) => current.filter((item) => item.id !== transfer.id || item.status === 'running'))
        }, 5000)
      }
    })
  }, [session.id])

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      for (const tab of tabsRef.current) {
        if (tab.loading || tab.remoteChanged) continue
        void window.barepane.stat(session.id, tab.path).then((fresh) => {
          const live = tabsRef.current.find((item) => item.path === tab.path)
          if (!live || live.remoteChanged) return
          if (fresh.modifiedAt === live.remoteModifiedAt && fresh.size === live.remoteSize) return
          patchTab(tab.path, { remoteChanged: true, remoteModifiedAt: fresh.modifiedAt, remoteSize: fresh.size })
        }).catch(() => undefined)
      }
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [active, session.id])

  useEffect(() => {
    localStorage.setItem(SPLIT_KEY, String(leftPct))
  }, [leftPct])

  useEffect(() => {
    localStorage.setItem(EDITOR_SPLIT_KEY, String(editorPct))
  }, [editorPct])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const load = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const next = showHealth
          ? await window.barepane.getHealth(session.id)
          : await window.barepane.getStats(session.id)
        if (cancelled) return
        setStats(next)
        setHealthError('')
      } catch (err) {
        if (cancelled) return
        if (showHealth) setHealthError(formatSshError(err))
        else {
          setStats(null)
          setHealthError(formatSshError(err))
        }
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), showHealth ? 10000 : 20000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [session.id, active, showHealth])

  useEffect(() => {
    if (!window.barepane) return
    let cancelled = false
    void (async () => {
      try {
        const live = await window.barepane.listTunnels(session.id)
        if (cancelled) return
        if (live.length) {
          setTunnels(live)
          return
        }
        const started: TunnelInfo[] = []
        const failed: string[] = []
        for (const recipe of loadTunnelRecipes(tunnelScope)) {
          try {
            started.push(await window.barepane.openTunnel(session.id, recipe))
          } catch (err) {
            failed.push(`${recipe.kind} :${recipe.listenPort} — ${formatSshError(err)}`)
          }
        }
        if (!cancelled) {
          setTunnels(started)
          if (failed.length) {
            setTunnelError(failed.join(' · '))
            flash(
              failed.length === 1
                ? `Tunnel failed: ${failed[0]}`
                : `${failed.length} saved tunnels failed to open`,
              'error',
            )
          }
        }
      } catch {
        if (!cancelled) setTunnels([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [flash, session.id, tunnelScope])

  function persistTunnels(next: TunnelInfo[]) {
    setTunnels(next)
    saveTunnelRecipes(
      tunnelScope,
      next.map((item) => ({
        kind: item.kind,
        listenPort: item.listenPort,
        destHost: item.destHost,
        destPort: item.destPort,
      })),
    )
  }

  async function addTunnel(draft: TunnelDraft) {
    setTunnelBusy(true)
    setTunnelError('')
    try {
      const next = await window.barepane.openTunnel(session.id, draft)
      persistTunnels([...tunnels, next])
    } finally {
      setTunnelBusy(false)
    }
  }

  async function openDashboard(remotePort: number) {
    const match = (list: TunnelInfo[]) =>
      list.find(
        (item) =>
          item.kind === 'local' &&
          item.destPort === remotePort &&
          (!item.destHost || item.destHost === '127.0.0.1' || item.destHost === 'localhost'),
      )
    let existing = match(tunnels)
    if (!existing) {
      const fallback = remotePort + 10000 <= 65535 ? remotePort + 10000 : Math.max(1024, remotePort - 2000)
      setTunnelBusy(true)
      setTunnelError('')
      try {
        let next: TunnelInfo
        try {
          next = await window.barepane.openTunnel(session.id, {
            kind: 'local',
            listenPort: remotePort,
            destHost: '127.0.0.1',
            destPort: remotePort,
          })
        } catch {
          next = await window.barepane.openTunnel(session.id, {
            kind: 'local',
            listenPort: fallback,
            destHost: '127.0.0.1',
            destPort: remotePort,
          })
        }
        persistTunnels([...tunnels, next])
        existing = next
      } finally {
        setTunnelBusy(false)
      }
    }
    if (!existing) throw new Error('Tunnel did not start.')
    await window.barepane.openLocalUrl(`http://127.0.0.1:${existing.listenPort}/`)
    flash(`Opened http://127.0.0.1:${existing.listenPort}/`, 'ok')
  }

  async function stopTunnel(id: string) {
    await window.barepane.closeTunnel(session.id, id)
    persistTunnels(tunnels.filter((item) => item.id !== id))
  }

  function patchTab(path: string, patch: Partial<EditorTab>) {
    setTabs((current) => {
      if (!current.some((tab) => tab.path === path)) return current
      return current.map((tab) => (tab.path === path ? { ...tab, ...patch } : tab))
    })
  }

  async function fillTab(file: RemoteFile) {
    try {
      const cached = cache.getFile(file.path)
      if (cached && cached.size === file.size && cached.modifiedAt === file.modifiedAt) {
        patchTab(file.path, { content: cached.content, original: cached.content, loading: false, error: '' })
        try {
          const fresh = await window.barepane.stat(session.id, file.path)
          const live = tabsRef.current.find((tab) => tab.path === file.path)
          if (!live || live.content !== live.original) return
          if (fresh.size === cached.size && fresh.modifiedAt === cached.modifiedAt) return
          const content = await window.barepane.readFile(session.id, file.path)
          if (!tabsRef.current.some((tab) => tab.path === file.path)) return
          if (looksBinary(content)) {
            patchTab(file.path, { loading: false, error: `${file.name} looks like a binary file.` })
            return
          }
          cache.setFile(file.path, { content, size: fresh.size, modifiedAt: fresh.modifiedAt })
          const stillClean = tabsRef.current.find((tab) => tab.path === file.path)
          if (stillClean && stillClean.content === stillClean.original) {
            patchTab(file.path, {
              content,
              original: content,
              loading: false,
              error: '',
              remoteModifiedAt: fresh.modifiedAt,
              remoteSize: fresh.size,
              remoteChanged: false,
            })
          }
        } catch {
          /* keep cached content */
        }
        return
      }

      const content = await window.barepane.readFile(session.id, file.path)
      if (!tabsRef.current.some((tab) => tab.path === file.path)) return
      let size = file.size
      let modifiedAt = file.modifiedAt
      try {
        const fresh = await window.barepane.stat(session.id, file.path)
        size = fresh.size
        modifiedAt = fresh.modifiedAt
      } catch {
        /* keep listing metadata */
      }
      if (looksBinary(content)) {
        patchTab(file.path, { loading: false, error: `${file.name} looks like a binary file.` })
        return
      }
      cache.setFile(file.path, { content, size, modifiedAt })
      patchTab(file.path, {
        content,
        original: content,
        loading: false,
        error: '',
        remoteModifiedAt: modifiedAt,
        remoteSize: size,
        remoteChanged: false,
      })
    } catch (err) {
      patchTab(file.path, { loading: false, error: formatSshError(err) })
    }
  }

  function openFile(file: RemoteFile, options?: { line?: number }) {
    if (layout === 'terminal') changeLayout('split')
    const existing = tabsRef.current.find((tab) => tab.path === file.path)
    setActivePath(file.path)
    if (existing) {
      if (options?.line) patchTab(file.path, { revealLine: options.line })
      if (!existing.loading && !existing.error) return
      if (existing.loading) return
    } else {
      setTabs((current) => [
        ...current,
        {
          path: file.path,
          name: file.name,
          content: '',
          original: '',
          loading: true,
          saving: false,
          error: '',
          remoteModifiedAt: file.modifiedAt,
          remoteSize: file.size,
          remoteChanged: false,
          revealLine: options?.line,
        },
      ])
    }
    void fillTab(file)
  }

  async function saveTab(path: string, force = false) {
    const tab = tabsRef.current.find((item) => item.path === path)
    if (!tab || tab.loading) return
    if (!force && tab.content === tab.original && !tab.remoteChanged) return
    if (!force) {
      try {
        const fresh = await window.barepane.stat(session.id, path)
        if (fresh.modifiedAt !== tab.remoteModifiedAt || fresh.size !== tab.remoteSize) {
          patchTab(path, { remoteChanged: true, remoteModifiedAt: fresh.modifiedAt, remoteSize: fresh.size, saving: false })
          if (!window.confirm(`“${tab.name}” changed on the server. Overwrite the remote file?`)) return
        }
      } catch {
        /* save anyway if stat fails */
      }
    }
    patchTab(path, { saving: true, error: '' })
    try {
      await elevate((sudoPassword) => window.barepane.writeFile(session.id, path, tab.content, sudoPassword))
      let modifiedAt = Date.now()
      let size = tab.content.length
      try {
        const fresh = await window.barepane.stat(session.id, path)
        modifiedAt = fresh.modifiedAt
        size = fresh.size
      } catch {
        /* keep local estimates */
      }
      cache.setFile(path, { content: tab.content, size, modifiedAt })
      patchTab(path, {
        original: tab.content,
        saving: false,
        remoteChanged: false,
        remoteModifiedAt: modifiedAt,
        remoteSize: size,
      })
      flash(`Saved ${tab.name}`, 'ok')
    } catch (err) {
      patchTab(path, { saving: false, error: formatSshError(err) })
      flash(formatSshError(err), 'error')
    }
  }

  async function reloadTab(path: string) {
    const tab = tabsRef.current.find((item) => item.path === path)
    if (!tab) return
    if (tab.content !== tab.original && !window.confirm(`Reload “${tab.name}” from the server? Your unsaved edits will be lost.`)) {
      return
    }
    patchTab(path, { loading: true, error: '', remoteChanged: false })
    await fillTab({
      name: tab.name,
      path: tab.path,
      isDirectory: false,
      isSymlink: false,
      size: tab.remoteSize,
      modifiedAt: tab.remoteModifiedAt,
      permissions: '',
    })
  }

  async function runSite(action: SiteAction) {
    try {
      const text = await elevate((sudoPassword) => window.barepane.runSiteAction(session.id, action, sudoPassword))
      flash(text.slice(0, 160), 'ok')
      if (action !== 'nginx-test') void refreshStats()
    } catch (err) {
      flash(formatSshError(err), 'error')
    }
  }

  function closeTab(path: string) {
    const tab = tabsRef.current.find((item) => item.path === path)
    if (tab && tab.content !== tab.original && !window.confirm(`“${tab.name}” has unsaved changes. Close anyway?`)) {
      return
    }
    setTabs((current) => {
      const next = current.filter((item) => item.path !== path)
      setActivePath((active) => {
        if (active !== path) return active
        const index = current.findIndex((item) => item.path === path)
        return next[index]?.path ?? next[index - 1]?.path ?? null
      })
      return next
    })
  }

  function startResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    setResizing(true)
    const startX = event.clientX
    const startPct = leftPct
    const onMove = (moveEvent: MouseEvent) => {
      const delta = ((moveEvent.clientX - startX) / window.innerWidth) * 100
      setLeftPct(Math.min(68, Math.max(32, startPct + delta)))
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startEditorResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    setResizing(true)
    const startY = event.clientY
    const startPct = editorPct
    const height = filesColumnRef.current?.clientHeight ?? window.innerHeight
    const onMove = (moveEvent: MouseEvent) => {
      const delta = ((startY - moveEvent.clientY) / height) * 100
      setEditorPct(Math.min(68, Math.max(28, startPct + delta)))
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const showFiles = layout !== 'terminal'
  const showTerminal = layout !== 'files'
  const showSplit = layout === 'split'
  const paletteCommands: PaletteCommand[] = [
    { id: 'files', label: 'Show files only', hint: 'Layout', run: () => changeLayout('files') },
    { id: 'split', label: 'Split files and terminal', hint: 'Layout', run: () => changeLayout('split') },
    { id: 'term', label: 'Show terminal only', hint: 'Layout', run: () => changeLayout('terminal') },
    { id: 'health', label: 'Open Health', run: () => setShowHealth(true) },
    { id: 'tunnels', label: 'Open Tunnels', run: () => setShowTunnels(true) },
    { id: 'logs', label: 'Open Logs', run: () => setShowLogs(true) },
    { id: 'services', label: 'Open Services', run: () => setShowServices(true) },
    { id: 'apps', label: 'Open Apps', run: () => setShowApps(true) },
    {
      id: 'grafana',
      label: 'Tunnel Grafana :3000 and open',
      hint: 'Typical dashboard port',
      run: () => void openDashboard(3000).catch((err) => flash(formatSshError(err), 'error')),
    },
    {
      id: 'prometheus',
      label: 'Tunnel Prometheus :9090 and open',
      hint: 'Typical dashboard port',
      run: () => void openDashboard(9090).catch((err) => flash(formatSshError(err), 'error')),
    },
    { id: 'help', label: 'Open Help', hint: 'F1', run: () => setShowHelp(true) },
    { id: 'nginx-test', label: 'Test nginx', hint: 'Site', run: () => void runSite('nginx-test') },
    { id: 'nginx-reload', label: 'Reload nginx', hint: 'Site', run: () => void runSite('nginx-reload') },
    { id: 'php-reload', label: 'Reload PHP-FPM', hint: 'Site', run: () => void runSite('php-reload') },
    {
      id: 'sites',
      label: 'Open nginx sites-enabled',
      hint: 'Site',
      run: () => {
        setCwd(SITES_ENABLED)
        if (layout === 'terminal') changeLayout('split')
        flash('Opened nginx sites-enabled', 'ok')
      },
    },
    { id: 'term-here', label: 'Open terminal in current folder', run: () => sendCommand(`cd ${shellQuote(cwd)}`) },
  ]

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-base">
      <TitleBar
        session={session}
        layout={layout}
        tunnelCount={tunnels.length}
        logCount={logCount}
        healthLevel={stats ? assessHealth(stats).overall : 'ok'}
        onLayoutChange={changeLayout}
        onHealth={() => setShowHealth(true)}
        onTunnels={() => setShowTunnels(true)}
        onLogs={() => setShowLogs(true)}
        onServices={() => setShowServices(true)}
        onApps={() => setShowApps(true)}
        onHelp={() => setShowHelp(true)}
        onSiteAction={(action) => void runSite(action)}
        onOpenSites={() => {
          setCwd(SITES_ENABLED)
          if (layout === 'terminal') changeLayout('split')
          flash('Opened nginx sites-enabled', 'ok')
        }}
        onDisconnect={() => {
          const dirty = tabsRef.current.some((tab) => tab.content !== tab.original)
          if (dirty && !window.confirm('You have unsaved files. Disconnect anyway?')) return
          sudoPasswordRef.current = null
          onDisconnect()
        }}
      />

      <div className={`flex min-h-0 flex-1 ${resizing ? 'select-none' : ''}`}>
        <section
          ref={filesColumnRef}
          className={`flex min-h-0 min-w-0 flex-col ${showFiles ? '' : 'hidden'} ${showSplit ? 'border-r border-white/10' : ''}`}
          style={showSplit ? { width: `${leftPct}%` } : showFiles ? { width: '100%' } : undefined}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <FileExplorer
              sessionId={session.id}
              bookmarkScope={`${session.username}@${session.host}:${session.port}`}
              home={session.home}
              cwd={cwd}
              active={active}
              onCwdChange={setCwd}
              onOpenInTerminal={(path) => {
                sendCommand(`cd ${shellQuote(path)}`)
                if (layout === 'files') changeLayout('split')
                flash(`Terminal → ${path}`, 'ok')
              }}
              onFollowLog={(path) => {
                logFollowSeq.current += 1
                setLogFollow({ kind: 'file', path, id: logFollowSeq.current })
                setShowLogs(true)
              }}
              onOpenFile={openFile}
              onFileRenamed={(fromPath, toPath, name) => {
                setTabs((current) =>
                  current.map((tab) => (tab.path === fromPath ? { ...tab, path: toPath, name } : tab)),
                )
                setActivePath((active) => (active === fromPath ? toPath : active))
              }}
              onFileDeleted={(path) => {
                setTabs((current) => {
                  const next = current.filter((tab) => tab.path !== path)
                  setActivePath((active) => {
                    if (active !== path) return active
                    const index = current.findIndex((tab) => tab.path === path)
                    return next[index]?.path ?? next[index - 1]?.path ?? null
                  })
                  return next
                })
              }}
              onNotice={flash}
              elevate={elevate}
            />
          </div>
          {tabs.length ? (
            <>
              <button
                type="button"
                aria-label="Resize file list and editor"
                onMouseDown={startEditorResize}
                className="h-1.5 shrink-0 cursor-row-resize bg-white/5 hover:bg-accent"
              />
              <div className="flex min-h-0 flex-col overflow-hidden" style={{ height: `${editorPct}%` }}>
                <EditorTabs
                  tabs={tabs}
                  activePath={activePath}
                  onSelect={setActivePath}
                  onChange={(path, content) => patchTab(path, { content })}
                  onSave={(path) => void saveTab(path, tabsRef.current.find((tab) => tab.path === path)?.remoteChanged)}
                  onReload={(path) => void reloadTab(path)}
                  onClose={closeTab}
                />
              </div>
            </>
          ) : null}
        </section>

        {showSplit ? (
          <button
            type="button"
            aria-label="Resize panes"
            onMouseDown={startResize}
            className="w-1.5 shrink-0 cursor-col-resize bg-white/5 hover:bg-accent"
          />
        ) : null}

        <section
          className={`flex min-h-0 min-w-0 flex-col bg-terminal ${showTerminal ? 'flex-1' : 'hidden'}`}
        >
          <TerminalGroup
            sessionId={session.id}
            cwd={cwd}
            visible={showTerminal}
            canBroadcast={canBroadcast}
            onActiveShell={(id) => {
              activeShellRef.current = id
            }}
            onRunActive={sendCommand}
            onRunAllShells={(command) => window.barepane.writeAllTerminals(session.id, `${command}\n`)}
            onRunAllServers={onBroadcast}
          />
        </section>
      </div>

      {sudoPrompt ? (
        <FileDialog
          title="Administrator password"
          input
          secret
          confirmLabel="Continue"
          error={sudoPrompt.error}
          message="This needs sudo. Enter the same password you use in the terminal (usually your login password)."
          onCancel={() => {
            sudoPrompt.resolve(null)
            setSudoPrompt(null)
          }}
          onConfirm={(password) => {
            sudoPrompt.resolve(password)
            setSudoPrompt(null)
          }}
        />
      ) : null}
      <TransferBar sessionId={session.id} transfers={transfers} />
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        commands={paletteCommands}
      />
      <StatusBar
        stats={stats}
        notice={notice}
        tunnelCount={tunnels.length}
        logCount={logCount}
        forwardAgent={session.forwardAgent}
        onOpenHealth={() => setShowHealth(true)}
      />
      <TunnelPanel
        tunnels={tunnels}
        open={showTunnels}
        busy={tunnelBusy}
        error={tunnelError}
        onClose={() => setShowTunnels(false)}
        onAdd={addTunnel}
        onStop={stopTunnel}
      />
      <LogPanel
        sessionId={session.id}
        open={showLogs}
        follow={logFollow}
        elevate={elevate}
        onCount={setLogCount}
        onFollowConsumed={() => setLogFollow(null)}
        onClose={() => setShowLogs(false)}
      />
      <ServicesPanel
        sessionId={session.id}
        open={showServices}
        elevate={elevate}
        onFollow={(follow) => {
          logFollowSeq.current += 1
          setLogFollow({ ...follow, id: logFollowSeq.current })
          setShowServices(false)
          setShowLogs(true)
        }}
        onClose={() => setShowServices(false)}
      />
      <RuntimePanel
        sessionId={session.id}
        open={showApps}
        onOpenDashboard={openDashboard}
        onClose={() => setShowApps(false)}
        onOpenPath={(path) => {
          const name = path.split('/').filter(Boolean).pop() || path
          setShowApps(false)
          openFile({
            name,
            path,
            isDirectory: false,
            isSymlink: false,
            size: 0,
            modifiedAt: 0,
            permissions: '',
          })
        }}
        onFollowFile={(path) => {
          logFollowSeq.current += 1
          setLogFollow({ kind: 'file', path, id: logFollowSeq.current })
          setShowApps(false)
          setShowLogs(true)
        }}
      />
      <HealthPanel
        stats={stats}
        open={showHealth}
        error={healthError}
        onClose={() => setShowHealth(false)}
        onRefresh={() => void refreshStats(true)}
        onFollowUnit={(unit) => {
          logFollowSeq.current += 1
          setLogFollow({ kind: 'journal', unit, id: logFollowSeq.current })
          setShowHealth(false)
          setShowLogs(true)
        }}
      />
      <HelpOverlay open={showHelp && active} onClose={() => setShowHelp(false)} />
    </div>
  )
}
