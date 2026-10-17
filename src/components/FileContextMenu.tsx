export type MenuItem =
  | {
      label: string
      shortcut?: string
      danger?: boolean
      disabled?: boolean
      onClick: () => void
    }
  | 'separator'

type Props = {
  x: number
  y: number
  items: readonly MenuItem[]
  onClose: () => void
}

export default function FileContextMenu({ x, y, items, onClose }: Props) {
  const left = Math.min(x, Math.max(8, window.innerWidth - 240))
  const top = Math.min(y, Math.max(8, window.innerHeight - 16 - items.length * 34))

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        role="menu"
        className="absolute min-w-52 rounded-lg border border-white/10 bg-surface py-1 shadow-2xl"
        style={{ left, top }}
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item, index) => {
          if (item === 'separator') {
            return <div key={`sep-${index}`} className="my-1 border-t border-white/10" />
          }
          return (
            <button
              key={`${item.label}-${index}`}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-[13px] disabled:opacity-40 ${
                item.danger ? 'text-red-300 hover:bg-red-500/20' : 'text-white/90 hover:bg-accent'
              }`}
              onClick={() => {
                item.onClick()
                onClose()
              }}
            >
              <span>{item.label}</span>
              {item.shortcut ? <span className="text-[10px] tracking-wide text-white/40">{item.shortcut}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
