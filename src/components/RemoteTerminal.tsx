import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'

type Props = {
  sessionId: string
  shellId: string
  visible?: boolean
  searchRequest?: number
  fontSize?: number
}

const SEARCH_DECORATIONS = {
  matchBackground: '#C4A00066',
  matchOverviewRuler: '#C4A000',
  activeMatchBackground: '#E9542088',
  activeMatchColorOverviewRuler: '#E95420',
}

export default function RemoteTerminal({ sessionId, shellId, visible = true, searchRequest = 0, fontSize = 13 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [match, setMatch] = useState({ index: -1, count: 0 })

  useEffect(() => {
    if (!window.barepane) return
    const node = containerRef.current
    if (!node) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      scrollback: 5000,
      fontFamily: 'Ubuntu Mono, Menlo, Monaco, Cascadia Mono, Consolas, monospace',
      macOptionIsMeta: true,
      smoothScrollDuration: 0,
      theme: {
        background: '#300A24',
        foreground: '#ffffff',
        cursor: '#E95420',
        selectionBackground: '#E9542066',
        black: '#2E3436',
        red: '#CC0000',
        green: '#4E9A06',
        yellow: '#C4A000',
        blue: '#3465A4',
        magenta: '#75507B',
        cyan: '#06989A',
        white: '#D3D7CF',
        brightBlack: '#555753',
        brightRed: '#EF2929',
        brightGreen: '#8AE234',
        brightYellow: '#FCE94F',
        brightBlue: '#729FCF',
        brightMagenta: '#AD7FA8',
        brightCyan: '#34E2E2',
        brightWhite: '#EEEEEC',
      },
    })
    const fit = new FitAddon()
    const search = new SearchAddon({ highlightLimit: 1000 })
    fitRef.current = fit
    termRef.current = term
    searchRef.current = search
    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(node)
    const offResults = search.onDidChangeResults((event) => {
      setMatch({ index: event.resultIndex, count: event.resultCount })
    })
    requestAnimationFrame(() => {
      fit.fit()
      window.barepane.resizeTerminal(sessionId, shellId, term.cols, term.rows)
    })

    const onData = term.onData((data) => window.barepane.writeTerminal(sessionId, shellId, data))
    const unsubscribe = window.barepane.onTerminalData((id, nextShell, data) => {
      if (id === sessionId && nextShell === shellId) term.write(data)
    })

    async function copySelection(): Promise<boolean> {
      const text = term.getSelection()
      if (!text) return false
      await window.barepane.writeClipboard(text)
      return true
    }

    async function pasteClipboard(): Promise<void> {
      const text = await window.barepane.readClipboard()
      if (!text) return
      window.barepane.writeTerminal(sessionId, shellId, text.replace(/\r?\n/g, '\r'))
    }

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const key = event.key.toLowerCase()
      const copyKey =
        ((event.metaKey || event.ctrlKey) && key === 'c' && (event.metaKey || event.shiftKey || term.hasSelection())) ||
        (event.ctrlKey && key === 'insert')
      const pasteKey =
        ((event.metaKey || event.ctrlKey) && key === 'v') || (event.shiftKey && key === 'insert')
      if (copyKey) {
        if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'c' && !term.hasSelection()) return true
        void copySelection()
        return false
      }
      if (pasteKey) {
        void pasteClipboard()
        return false
      }
      return true
    })

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (term.hasSelection()) void copySelection()
      else void pasteClipboard()
    }
    node.addEventListener('contextmenu', onContextMenu)

    window.barepane.readyTerminal(sessionId, shellId)

    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        fit.fit()
        window.barepane.resizeTerminal(sessionId, shellId, term.cols, term.rows)
      })
    })
    observer.observe(node)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      node.removeEventListener('contextmenu', onContextMenu)
      offResults.dispose()
      onData.dispose()
      unsubscribe()
      fitRef.current = null
      termRef.current = null
      searchRef.current = null
      term.dispose()
    }
  }, [sessionId, shellId])

  useEffect(() => {
    if (!visible) return
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit || !window.barepane) return
    requestAnimationFrame(() => {
      fit.fit()
      window.barepane.resizeTerminal(sessionId, shellId, term.cols, term.rows)
    })
  }, [visible, sessionId, shellId])

  useEffect(() => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit || !window.barepane) return
    term.options.fontSize = fontSize
    requestAnimationFrame(() => {
      fit.fit()
      window.barepane.resizeTerminal(sessionId, shellId, term.cols, term.rows)
    })
  }, [fontSize, sessionId, shellId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        const node = containerRef.current
        const active = document.activeElement
        if (!node || !(node.contains(active) || active === inputRef.current)) return
        event.preventDefault()
        setSearchOpen(true)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault()
        closeSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  useEffect(() => {
    if (!searchRequest) return
    setSearchOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [searchRequest])

  function searchOptions(incremental = false) {
    return {
      incremental,
      decorations: SEARCH_DECORATIONS,
    }
  }

  function findNext(incremental = false) {
    const trimmed = query.trim()
    if (!trimmed) {
      searchRef.current?.clearDecorations()
      setMatch({ index: -1, count: 0 })
      return
    }
    searchRef.current?.findNext(trimmed, searchOptions(incremental))
  }

  function findPrevious() {
    const trimmed = query.trim()
    if (!trimmed) return
    searchRef.current?.findPrevious(trimmed, searchOptions())
  }

  function closeSearch() {
    setSearchOpen(false)
    searchRef.current?.clearDecorations()
    setMatch({ index: -1, count: 0 })
    containerRef.current?.querySelector('textarea')?.focus()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {searchOpen ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/25 px-2 py-1.5">
          <input
            ref={inputRef}
            value={query}
            placeholder="Find in this terminal"
            className="ui-input h-7 py-1 text-xs"
            onChange={(event) => {
              setQuery(event.target.value)
              requestAnimationFrame(() => {
                const trimmed = event.target.value.trim()
                if (!trimmed) {
                  searchRef.current?.clearDecorations()
                  setMatch({ index: -1, count: 0 })
                  return
                }
                searchRef.current?.findNext(trimmed, searchOptions(true))
              })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (event.shiftKey) findPrevious()
                else findNext()
              }
            }}
          />
          <span className="shrink-0 text-[11px] text-white/45">
            {query.trim() ? (match.count ? `${Math.max(1, match.index + 1)}/${match.count}` : 'No matches') : ''}
          </span>
          <button type="button" className="ui-btn py-1 text-[11px]" onClick={() => findPrevious()}>
            Prev
          </button>
          <button type="button" className="ui-btn py-1 text-[11px]" onClick={() => findNext()}>
            Next
          </button>
          <button type="button" className="ui-btn py-1 text-[11px]" onClick={closeSearch}>
            Done
          </button>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 px-2 py-2"
        onClick={() => containerRef.current?.querySelector('textarea')?.focus()}
      />
    </div>
  )
}
