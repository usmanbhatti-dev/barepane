import { useEffect, useState } from 'react'
import { formatSshError } from '@shared/errors'
import { stackLabel, uniqueDashboards } from '@shared/runtime'
import type { ComposeAction, ComposeProject, RuntimeSnapshot, SecuritySnapshot } from '@shared/types'

type Tab = 'running' | 'pm2' | 'security'

type Props = {
  sessionId: string
  open: boolean
  onClose: () => void
  onOpenPath: (path: string) => void
  onFollowFile?: (path: string) => void
  onOpenDashboard?: (port: number) => Promise<void>
}

function tone(level: 'ok' | 'warn' | 'bad'): string {
  if (level === 'bad') return 'border-red-400/25 bg-red-500/10 text-red-100'
  if (level === 'warn') return 'border-amber-400/20 bg-amber-500/10 text-amber-100'
  return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
}

export default function RuntimePanel({ sessionId, open, onClose, onOpenPath, onFollowFile, onOpenDashboard }: Props) {
  const [tab, setTab] = useState<Tab>('running')
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null)
  const [security, setSecurity] = useState<SecuritySnapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [working, setWorking] = useState<string | null>(null)

  useEffect(() => {
    setRuntime(null)
    setSecurity(null)
    setError('')
  }, [sessionId])

  useEffect(() => {
    if (!open || !window.barepane) return
    let cancelled = false
    const load = async () => {
      if (document.visibilityState === 'hidden') return
      setBusy(true)
      setError('')
      try {
        const next = await window.barepane.getRuntime(sessionId)
        if (!cancelled) setRuntime(next)
      } catch (err) {
        if (!cancelled) setError(formatSshError(err))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, sessionId])

  useEffect(() => {
    if (!open || tab !== 'security' || security || !window.barepane) return
    let cancelled = false
    void window.barepane
      .getSecurity(sessionId)
      .then((next) => {
        if (!cancelled) setSecurity(next)
      })
      .catch((err) => {
        if (!cancelled) setError(formatSshError(err))
      })
    return () => {
      cancelled = true
    }
  }, [open, tab, security, sessionId])

  async function refresh() {
    setBusy(true)
    setError('')
    try {
      const next = await window.barepane.getRuntime(sessionId)
      setRuntime(next)
      if (tab === 'security') setSecurity(await window.barepane.getSecurity(sessionId))
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setBusy(false)
    }
  }

  async function runPm2(name: string, action: 'restart' | 'start' | 'stop') {
    setWorking(name)
    try {
      await window.barepane.controlPm2(sessionId, name, action)
      setRuntime(await window.barepane.getRuntime(sessionId))
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setWorking(null)
    }
  }

  async function runCompose(project: ComposeProject, action: ComposeAction) {
    setWorking(`${action}:${project.name}`)
    try {
      await window.barepane.controlCompose(sessionId, project.name, action, project.configFile)
      setRuntime(await window.barepane.getRuntime(sessionId))
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setWorking(null)
    }
  }

  async function openDashboard(port: number) {
    if (!onOpenDashboard) return
    setWorking(`dash:${port}`)
    try {
      await onOpenDashboard(port)
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setWorking(null)
    }
  }

  if (!open) return null

  const dashboards = runtime ? uniqueDashboards(runtime.ports) : []

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">What’s running</h2>
            <p className="text-[11px] text-white/45">On demand — does not poll, so the terminal stays fast</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="ui-btn" disabled={busy} onClick={() => void refresh()}>
              {busy ? 'Reading…' : 'Refresh'}
            </button>
            <button type="button" className="ui-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="flex gap-1 border-b border-white/10 px-3 py-2">
          {([
            { id: 'running', label: 'Apps' },
            { id: 'pm2', label: 'PM2 / Compose' },
            { id: 'security', label: 'Security' },
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
        {error ? <p className="px-4 pt-3 text-sm text-red-300">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'running' ? (
            runtime ? (
              <div className="space-y-4">
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Stacks</h3>
                  {runtime.stacks.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {runtime.stacks.map((stack) => (
                        <span key={`${stack.kind}-${stack.name}`} className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/80">
                          {stackLabel(stack.kind)} · {stack.name} ×{stack.count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">No Node, Python, PHP, nginx, or Docker process found.</p>
                  )}
                </section>
                {runtime.restarting.length ? (
                  <section className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    Restarting: {runtime.restarting.join(', ')}
                  </section>
                ) : null}
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Listening ports</h3>
                  <ul className="mt-2 space-y-1">
                    {runtime.ports.map((item) => (
                      <li key={`${item.address}:${item.port}`} className="flex justify-between rounded-lg bg-white/6 px-3 py-1.5 text-xs">
                        <span className="font-mono">
                          {item.address}:{item.port}
                        </span>
                        <span className={item.public ? 'text-amber-200' : 'text-white/40'}>{item.public ? 'public' : 'localhost'}</span>
                      </li>
                    ))}
                  </ul>
                  {dashboards.length ? (
                    <ul className="mt-2 space-y-1">
                      {dashboards.map((dash) => (
                        <li key={dash.id} className="flex items-center justify-between rounded-lg bg-white/6 px-3 py-2 text-xs">
                          <span>
                            {dash.label} · :{dash.port}
                          </span>
                          {dash.open && onOpenDashboard ? (
                            <button
                              type="button"
                              className="text-[11px] text-accent-fg hover:text-white"
                              disabled={Boolean(working)}
                              onClick={() => void openDashboard(dash.port)}
                            >
                              Tunnel & open
                            </button>
                          ) : (
                            <span className="text-white/35">metrics</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Nginx sites</h3>
                  {runtime.vhosts.length ? (
                    <ul className="mt-2 space-y-1">
                      {runtime.vhosts.map((site) => (
                        <li key={site.file} className="rounded-lg bg-white/6 px-3 py-2">
                          <div className="truncate text-sm">{site.serverName || site.file}</div>
                          <div className="truncate text-[11px] text-white/45">
                            {site.kind === 'proxy' ? `Proxy → ${site.proxy}` : site.kind === 'static' ? `Static ${site.root}` : 'Site'}
                          </div>
                          <button type="button" className="mt-1 text-[11px] text-accent-fg hover:text-white" onClick={() => onOpenPath(site.file)}>
                            Open config
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">No files in /etc/nginx/sites-enabled.</p>
                  )}
                </section>
              </div>
            ) : (
              <p className="text-sm text-white/45">{busy ? 'Reading processes and ports…' : 'Open this panel to snapshot the server.'}</p>
            )
          ) : null}

          {tab === 'pm2' ? (
            runtime ? (
              <div className="space-y-4">
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">PM2</h3>
                  {runtime.pm2Missing ? (
                    <p className="mt-2 text-sm text-white/45">PM2 is not installed for this user.</p>
                  ) : runtime.pm2.length ? (
                    <ul className="mt-2 space-y-1">
                      {runtime.pm2.map((app) => (
                        <li key={app.name} className="rounded-lg bg-white/6 px-3 py-2">
                          <div className="flex justify-between gap-2">
                            <span className="truncate font-mono text-[13px]">{app.name}</span>
                            <span className={`text-[11px] ${app.status === 'online' ? 'text-emerald-300' : 'text-amber-200'}`}>{app.status}</span>
                          </div>
                          <div className="text-[11px] text-white/40">restarts {app.restarts}</div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runPm2(app.name, 'restart')}>
                              Restart
                            </button>
                            {app.status === 'online' ? (
                              <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runPm2(app.name, 'stop')}>
                                Stop
                              </button>
                            ) : (
                              <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runPm2(app.name, 'start')}>
                                Start
                              </button>
                            )}
                            {app.outLog && onFollowFile ? (
                              <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" onClick={() => onFollowFile(app.outLog!)}>
                                Logs
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">No PM2 apps.</p>
                  )}
                </section>
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Docker Compose</h3>
                  {runtime.compose.length ? (
                    <ul className="mt-2 space-y-1">
                      {runtime.compose.map((project) => (
                        <li key={project.name} className="rounded-lg bg-white/6 px-3 py-2">
                          <div className="truncate font-mono text-[13px]">{project.name}</div>
                          <div className="truncate text-[11px] text-white/45">{project.status || 'compose'}</div>
                          {project.configFile ? (
                            <div className="truncate text-[11px] text-white/35">{project.configFile}</div>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {project.configFile ? (
                              <>
                                <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runCompose(project, 'up')}>
                                  Up
                                </button>
                                <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runCompose(project, 'down')}>
                                  Down
                                </button>
                              </>
                            ) : null}
                            <button type="button" className="ui-btn px-2 py-0.5 text-[11px]" disabled={Boolean(working)} onClick={() => void runCompose(project, 'restart')}>
                              Restart
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">No compose projects (or Docker is not installed).</p>
                  )}
                </section>
              </div>
            ) : (
              <p className="text-sm text-white/45">{busy ? 'Reading…' : 'Refresh to load PM2 and Compose.'}</p>
            )
          ) : null}

          {tab === 'security' ? (
            security ? (
              <div className="space-y-3">
                {security.findings.map((item) => (
                  <div key={item.id} className={`rounded-lg border px-3 py-2 text-sm ${tone(item.level)}`}>
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-0.5 text-[11px] leading-5 opacity-80">{item.detail}</div>
                  </div>
                ))}
                {security.certs.length ? (
                  <div>
                    <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Certificates</h3>
                    {security.certs.map((cert) => (
                      <div key={cert.name} className="text-xs text-white/65">
                        {cert.name} · {cert.days !== undefined ? `${cert.days} days` : cert.expires}
                      </div>
                    ))}
                  </div>
                ) : null}
                <p className="text-[11px] leading-5 text-white/35">This is a glance, not a full audit. It does not change sshd or the firewall.</p>
              </div>
            ) : (
              <p className="text-sm text-white/45">Reading SSH, ports, and certs…</p>
            )
          ) : null}
        </div>
      </aside>
    </div>
  )
}
