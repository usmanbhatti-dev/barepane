import type { TransferProgress } from '@shared/types'

type Props = {
  sessionId: string
  transfers: TransferProgress[]
}

function percent(item: TransferProgress): number {
  if (!item.total) return item.status === 'done' ? 100 : 0
  return Math.min(100, Math.round((item.transferred / item.total) * 100))
}

export default function TransferBar({ sessionId, transfers }: Props) {
  if (!transfers.length) return null
  return (
    <div className="shrink-0 space-y-1 border-t border-white/10 bg-surface-2 px-3 py-1.5 text-[11px]">
      {transfers.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-white/45">{item.kind === 'upload' ? 'Upload' : 'Download'}</span>
          <span className="min-w-0 flex-1 truncate text-white/80">{item.name}</span>
          {item.status === 'error' || item.status === 'cancelled' ? (
            <span className={item.status === 'cancelled' ? 'text-white/45' : 'text-red-300'}>
              {item.status === 'cancelled' ? 'Cancelled' : item.error || 'Failed'}
            </span>
          ) : (
            <>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-accent" style={{ width: `${percent(item)}%` }} />
              </div>
              <span className="w-10 text-right text-white/50">{item.status === 'done' ? 'Done' : `${percent(item)}%`}</span>
              {item.status === 'running' ? (
                <button
                  type="button"
                  className="text-white/45 hover:text-white"
                  onClick={() => void window.barepane.cancelTransfer(sessionId, item.id)}
                >
                  Cancel
                </button>
              ) : null}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
