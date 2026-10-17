import { assessHealth } from '@shared/health'
import type { HealthLevel, ServerStats } from '@shared/types'

export type Notice = {
  text: string
  kind: 'ok' | 'error' | 'info'
}

type Props = {
  stats: ServerStats | null
  notice: Notice | null
  tunnelCount?: number
  logCount?: number
  forwardAgent?: boolean
  onOpenHealth?: () => void
}

function healthLabel(level: HealthLevel): string {
  if (level === 'bad') return 'alert'
  if (level === 'warn') return 'check'
  return 'OK'
}

export default function StatusBar({ stats, notice, tunnelCount = 0, logCount = 0, forwardAgent = false, onOpenHealth }: Props) {
  const health = stats ? assessHealth(stats) : null
  const chips = stats
    ? [
        { label: 'Host', value: stats.hostname },
        { label: 'OS', value: stats.os },
        { label: 'CPU', value: `${stats.cpus} · ${stats.load}` },
        { label: 'RAM', value: stats.memory },
        { label: 'Disk', value: stats.disk },
        { label: 'Up', value: stats.uptime },
      ]
    : [{ label: 'Status', value: 'Reading remote system…' }]

  const noticeClass =
    notice?.kind === 'error' ? 'text-red-300' : notice?.kind === 'ok' ? 'text-emerald-300' : 'text-accent-fg'

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 bg-surface-2 px-3 py-1.5 text-[11px] text-white/70">
      {health ? (
        <button
          type="button"
          onClick={onOpenHealth}
          className={`whitespace-nowrap rounded-full px-2 py-0.5 ${
            health.overall === 'bad'
              ? 'bg-red-500/20 text-red-200'
              : health.overall === 'warn'
                ? 'bg-amber-500/20 text-amber-100'
                : 'bg-emerald-500/15 text-emerald-200'
          } ${onOpenHealth ? 'hover:brightness-110' : ''}`}
          title={health.notes[0] || 'VPS health'}
        >
          <span className="text-white/45">Health</span> {healthLabel(health.overall)}
        </button>
      ) : null}
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={onOpenHealth}
          className={`whitespace-nowrap rounded-full bg-white/8 px-2 py-0.5 ${onOpenHealth ? 'hover:bg-white/12' : ''}`}
          title={onOpenHealth ? 'Open VPS health' : chip.label}
        >
          <span className="text-white/35">{chip.label}</span> {chip.value}
        </button>
      ))}
      {tunnelCount ? (
        <span className="whitespace-nowrap rounded-full bg-white/8 px-2 py-0.5">
          <span className="text-white/35">Tunnels</span> {tunnelCount}
        </span>
      ) : null}
      {logCount ? (
        <span className="whitespace-nowrap rounded-full bg-white/8 px-2 py-0.5">
          <span className="text-white/35">Logs</span> {logCount}
        </span>
      ) : null}
      {forwardAgent ? (
        <span className="whitespace-nowrap rounded-full bg-white/8 px-2 py-0.5" title="This server can use your local ssh-agent">
          <span className="text-white/35">Agent</span> forwarded
        </span>
      ) : null}
      {notice ? <span className={`ml-auto whitespace-nowrap ${noticeClass}`}>{notice.text}</span> : null}
    </div>
  )
}
