import { useEffect, useMemo, useRef, useState } from 'react'

export type PaletteCommand = {
  id: string
  label: string
  hint?: string
  run: () => void
}

type Props = {
  open: boolean
  commands: PaletteCommand[]
  onClose: () => void
}

export default function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter((item) => item.label.toLowerCase().includes(needle) || item.hint?.toLowerCase().includes(needle))
  }, [commands, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  if (!open) return null

  function run(item: PaletteCommand) {
    onClose()
    item.run()
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-start justify-center bg-black/45 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#2a2a2a]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Jump to a command…"
          className="ui-input rounded-none border-0 border-b border-white/10"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIndex((current) => Math.min(matches.length - 1, current + 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setIndex((current) => Math.max(0, current - 1))
            }
            if (event.key === 'Enter' && matches[index]) {
              event.preventDefault()
              run(matches[index])
            }
          }}
        />
        <ul className="max-h-72 overflow-y-auto py-1">
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-white/40">No matching commands.</li>
          ) : (
            matches.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    i === index ? 'bg-ubuntu/30 text-white' : 'text-white/75 hover:bg-white/6'
                  }`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(item)}
                >
                  <span>{item.label}</span>
                  {item.hint ? <span className="text-[11px] text-white/40">{item.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
