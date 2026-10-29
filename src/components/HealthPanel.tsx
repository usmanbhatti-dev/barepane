import { assessHealth, ratioLevel } from '@shared/health'
import type { HealthLevel, ServerStats } from '@shared/types'

type Props = {
  stats: ServerStats | null
  open: boolean
  error?: string
  onClose: () => void
  onRefresh: () => void
  onFollowUnit?: (unit: string) => void
  onReboot?: () => void
  rebooting?: boolean
}

function tone(level: HealthLevel): string {
  if (level === 'bad') return 'text-red-300'
  if (level === 'warn') return 'text-amber-300'
  return 'text-emerald-300'
}

function barColor(level: HealthLevel): string {
  if (level === 'bad') return 'bg-red-400'
  if (level === 'warn') return 'bg-amber-400'
  return 'bg-emerald-400'
}

function Bar({ percent, level }: { percent: number; level: HealthLevel }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${barColor(level)}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  )
}

function memPercent(stats: ServerStats): number {
  if (stats.memTotalMb <= 0) return 0
  return Math.round((stats.memUsedMb / stats.memTotalMb) * 100)
}

function loadPercent(stats: ServerStats): number {
  const n = Math.max(1, stats.cpuCount)
  return Math.min(100, Math.round((stats.load1 / n) * 100))
}

export default function HealthPanel({ stats, open, error, onClose, onRefresh, onFollowUnit, onReboot, rebooting }: Props) {
  if (!open) return null
  const health = stats ? assessHealth(stats) : null
  const headline = health?.overall === 'bad' ? 'Needs attention' : health?.overall === 'warn' ? 'Check this server' : 'Looks healthy'

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">VPS health</h2>
            <p className={`text-[11px] ${health ? tone(health.overall) : 'text-white/45'}`}>{stats ? headline : 'Reading remote system…'}</p>
          </div>
          <div className="flex gap-2">
            {onReboot ? (
              <button type="button" className="ui-btn" disabled={rebooting} onClick={onReboot}>
                {rebooting ? 'Rebooting…' : 'Reboot'}
              </button>
            ) : null}
            <button type="button" className="ui-btn" onClick={onRefresh}>
              Refresh
            </button>
            <button type="button" className="ui-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? <p className="mb-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          {!stats ? (
            <p className="text-sm text-white/45">Collecting CPU, memory, disk, and service health from the server.</p>
          ) : (
            <div className="space-y-4">
              {health?.notes.length ? (
                <ul className="space-y-1">
                  {health.notes.map((note) => (
                    <li key={note} className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <span>{note}</span>
                      {onReboot && /reboot/i.test(note) ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 font-semibold hover:bg-white/15 disabled:opacity-40"
                          disabled={rebooting}
                          onClick={onReboot}
                        >
                          {rebooting ? 'Rebooting…' : 'Reboot now'}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">Load, memory, and disks are within a comfortable range.</p>
              )}

              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Machine</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div className="col-span-2">
                    <dt className="text-white/40">Hostname</dt>
                    <dd className="font-medium">{stats.hostname}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-white/40">OS</dt>
                    <dd>{stats.os}{stats.arch ? ` · ${stats.arch}` : ''}</dd>
                  </div>
                  {stats.kernel ? (
                    <div className="col-span-2">
                      <dt className="text-white/40">Kernel</dt>
                      <dd className="font-mono text-[11px] text-white/75">{stats.kernel}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-white/40">Uptime</dt>
                    <dd>{stats.uptime}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Clock</dt>
                    <dd>{stats.time || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Virt</dt>
                    <dd>{stats.virt && stats.virt !== 'none' ? stats.virt : 'unknown / metal'}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40">Logins</dt>
                    <dd>{stats.users}</dd>
                  </div>
                  {stats.ips.length ? (
                    <div className="col-span-2">
                      <dt className="text-white/40">Addresses</dt>
                      <dd className="font-mono text-[11px] leading-5 text-white/80">{stats.ips.join(' · ')}</dd>
                    </div>
                  ) : null}
                  {stats.cpuModel ? (
                    <div className="col-span-2">
                      <dt className="text-white/40">CPU</dt>
                      <dd>{stats.cpuCount} × {stats.cpuModel}</dd>
                    </div>
                  ) : (
                    <div className="col-span-2">
                      <dt className="text-white/40">CPU</dt>
                      <dd>{stats.cpuCount || stats.cpus} cores</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="space-y-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Performance</h3>
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/55">Load</span>
                    <span className={health ? tone(health.load) : ''}>
                      {stats.load1.toFixed(2)} / {Math.max(1, stats.cpuCount)}
                      <span className="text-white/35"> · {stats.load}</span>
                    </span>
                  </div>
                  <Bar percent={loadPercent(stats)} level={health?.load ?? 'ok'} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-white/55">Memory</span>
                    <span className={health ? tone(health.memory) : ''}>
                      {stats.memory}
                      {stats.memAvailMb ? <span className="text-white/35"> · {stats.memAvailMb} MB free</span> : null}
                    </span>
                  </div>
                  <Bar percent={memPercent(stats)} level={health?.memory ?? 'ok'} />
                </div>
                {stats.swapTotalMb > 0 ? (
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-white/55">Swap</span>
                      <span>{stats.swapUsedMb}/{stats.swapTotalMb} MB</span>
                    </div>
                    <Bar percent={Math.round((stats.swapUsedMb / stats.swapTotalMb) * 100)} level={ratioLevel(stats.swapUsedMb, stats.swapTotalMb)} />
                  </div>
                ) : null}
              </section>

              {stats.disks.length ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Disks</h3>
                  <ul className="mt-2 space-y-2">
                    {stats.disks.map((disk) => {
                      const level = disk.percent >= 95 ? 'bad' : disk.percent >= 85 ? 'warn' : 'ok'
                      const inodeLevel =
                        disk.inodePercent == null ? 'ok' : disk.inodePercent >= 95 ? 'bad' : disk.inodePercent >= 85 ? 'warn' : 'ok'
                      return (
                        <li key={disk.mount}>
                          <div className="mb-1 flex justify-between gap-2 text-xs">
                            <span className="truncate font-mono text-white/70">{disk.mount}</span>
                            <span className={tone(level)}>
                              {disk.percent}% · {disk.used}/{disk.size}
                              {disk.inodePercent != null ? (
                                <span className={tone(inodeLevel)}> · inodes {disk.inodePercent}%</span>
                              ) : null}
                            </span>
                          </div>
                          <Bar percent={disk.percent} level={level} />
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}

              {stats.failedUnitNames.length ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Failed services</h3>
                  <ul className="mt-2 space-y-1">
                    {stats.failedUnitNames.map((unit) => (
                      <li key={unit} className="flex items-center justify-between rounded-lg bg-white/6 px-3 py-2 text-xs">
                        <span className="truncate font-mono text-red-200">{unit}</span>
                        {onFollowUnit ? (
                          <button type="button" className="shrink-0 text-white/50 hover:text-white" onClick={() => onFollowUnit(unit)}>
                            Logs
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {stats.processes.length ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Top processes</h3>
                  <table className="mt-2 w-full text-left text-[11px]">
                    <thead className="text-white/35">
                      <tr>
                        <th className="pb-1 font-medium">CPU</th>
                        <th className="pb-1 font-medium">RAM</th>
                        <th className="pb-1 font-medium">Command</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.processes.map((proc) => (
                        <tr key={`${proc.pid}-${proc.command}`} className="text-white/75">
                          <td className="py-0.5 pr-2 font-mono">{proc.cpu.toFixed(1)}%</td>
                          <td className="py-0.5 pr-2 font-mono">{proc.mem.toFixed(1)}%</td>
                          <td className="max-w-[10rem] truncate py-0.5" title={`${proc.user} ${proc.command}`}>
                            {proc.command}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
