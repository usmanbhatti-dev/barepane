import type { ConnectResult } from '@shared/types'

type Props = {
  sessions: ConnectResult[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onAdd: () => void
}

function tabColor(host: string): string {
  let hash = 0
  for (const char of host) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const palette = ['#E95420', '#19B6EE', '#26A269', '#F5C211', '#C061CB', '#62A0EA']
  return palette[hash % palette.length] ?? '#E95420'
}

export default function ConnectionBar({ sessions, activeId, onSelect, onClose, onAdd }: Props) {
  return (
    <div className="chrome-inset app-drag flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-[#1a0014]">
      <div className="app-no-drag flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {sessions.map((session) => {
          const active = session.id === activeId
          const label = `${session.username}@${session.host}`
          return (
            <button
              key={session.id}
              type="button"
              title={label}
              onClick={() => onSelect(session.id)}
              className={`flex max-w-[14rem] shrink-0 items-center gap-2 rounded-md px-2 py-1 text-xs ${
                active ? 'bg-white/14 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white'
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tabColor(session.host) }} />
              <span className="truncate">{label}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Disconnect ${label}`}
                className="rounded px-1 text-white/40 hover:bg-white/15 hover:text-white"
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(session.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    onClose(session.id)
                  }
                }}
              >
                ×
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
        >
          + Server
        </button>
      </div>
    </div>
  )
}
