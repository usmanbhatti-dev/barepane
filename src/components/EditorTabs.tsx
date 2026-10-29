import { useEffect } from 'react'
import { detectLanguage, languageLabel } from '@shared/languages'
import { parentDir, pathSegments } from '@shared/paths'
import { lineCount } from '../lib/files'
import CodeEditor from './CodeEditor'

export type EditorTab = {
  path: string
  name: string
  content: string
  original: string
  loading: boolean
  saving: boolean
  error: string
  remoteModifiedAt: number
  remoteSize: number
  remoteChanged: boolean
  revealLine?: number
}

type Props = {
  tabs: EditorTab[]
  activePath: string | null
  onSelect: (path: string) => void
  onChange: (path: string, content: string) => void
  onSave: (path: string) => void
  onReload: (path: string) => void
  onClose: (path: string) => void
  wrap?: boolean
  onWrapChange?: (wrap: boolean) => void
  onOpenDir?: (path: string) => void
}

export default function EditorTabs({
  tabs,
  activePath,
  onSelect,
  onChange,
  onSave,
  onReload,
  onClose,
  wrap = true,
  onWrapChange,
  onOpenDir,
}: Props) {
  const active = tabs.find((tab) => tab.path === activePath) ?? tabs[0]
  const dirty = Boolean(active && active.content !== active.original)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && active) {
        event.preventDefault()
        onSave(active.path)
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'w' && active) {
        const target = event.target as HTMLElement | null
        if (target?.tagName !== 'TEXTAREA' && !target?.closest('.cm-editor')) return
        event.preventDefault()
        onClose(active.path)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onClose, onSave])

  if (!active) return null

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-white/10 bg-surface-2">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 px-1">
        {tabs.map((tab) => {
          const tabDirty = tab.content !== tab.original
          const selected = tab.path === active.path
          return (
            <button
              key={tab.path}
              type="button"
              title={tab.path}
              onClick={() => onSelect(tab.path)}
              className={`group flex max-w-48 shrink-0 items-center gap-2 rounded-t-md px-3 py-2 text-xs ${
                selected ? 'bg-surface text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="truncate">{tab.name}</span>
              {tab.loading ? <span className="tab-spinner" /> : null}
              {tabDirty && !tab.loading ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
              <span
                role="button"
                tabIndex={0}
                className="rounded px-1 text-white/35 hover:bg-white/15 hover:text-white"
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.path)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    onClose(tab.path)
                  }
                }}
              >
                ×
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {active.loading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-2/92">
            <div className="file-open-spinner" />
            <div className="text-sm text-white/70">Opening {active.name}…</div>
            <div className="max-w-md truncate px-4 font-mono text-[11px] text-white/40">{active.path}</div>
          </div>
        ) : null}

        {active.remoteChanged ? (
          <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
            <span className="min-w-0 flex-1">This file changed on the server while it was open.</span>
            <button type="button" className="rounded-md bg-white/10 px-2 py-0.5 font-semibold hover:bg-white/15" onClick={() => onReload(active.path)}>
              Reload
            </button>
            <button type="button" className="rounded-md bg-accent px-2 py-0.5 font-semibold" onClick={() => onSave(active.path)}>
              Overwrite
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs">
          <nav className="flex min-w-0 flex-1 items-center overflow-x-auto font-mono text-white/55" aria-label="File path">
            <button
              type="button"
              className="shrink-0 hover:text-white"
              onClick={() => onOpenDir?.('/')}
            >
              /
            </button>
            {pathSegments(active.path).map((part, index, parts) => {
              const dir = index === parts.length - 1 ? parentDir(active.path) : `/${parts.slice(0, index + 1).join('/')}`
              return (
                <span key={`${dir}-${part}`} className="flex min-w-0 shrink-0 items-center">
                  {index > 0 ? <span className="px-0.5 text-white/25">/</span> : null}
                  <button
                    type="button"
                    title={dir}
                    className={`max-w-[9rem] truncate hover:text-white ${index === parts.length - 1 ? 'text-white/80' : ''}`}
                    onClick={() => onOpenDir?.(dir)}
                  >
                    {part}
                  </button>
                </span>
              )
            })}
          </nav>
          {onWrapChange ? (
            <button
              type="button"
              className={`shrink-0 rounded-md px-2 py-1 font-semibold ${wrap ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/8'}`}
              onClick={() => onWrapChange(!wrap)}
            >
              Wrap
            </button>
          ) : null}
          <button
            type="button"
            disabled={active.loading || !dirty || active.saving}
            className="rounded-md bg-accent px-2.5 py-1 font-semibold disabled:opacity-40"
            onClick={() => onSave(active.path)}
          >
            {active.saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {active.error ? (
          <div className="px-3 py-2 text-sm text-red-300">{active.error}</div>
        ) : active.loading ? (
          <div className="min-h-0 flex-1" />
        ) : (
          <CodeEditor
            key={active.path}
            path={active.path}
            value={active.content}
            revealLine={active.revealLine}
            wrap={wrap}
            onChange={(content) => onChange(active.path, content)}
          />
        )}

        <div className="flex justify-between border-t border-white/10 px-3 py-1 text-[11px] text-white/40">
          <span>
            {active.loading
              ? 'Loading'
              : `${lineCount(active.content)} lines · ${languageLabel(detectLanguage(active.path))}`}
          </span>
          <span>{dirty ? 'Modified' : 'Saved'} · ⌘S save · ⌘F find · ⌘⌥G line · ⌘K commands</span>
        </div>
      </div>
    </div>
  )
}
