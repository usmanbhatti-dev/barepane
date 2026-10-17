import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { normalizePath, pathSegments } from '@shared/paths'
import type { RemoteFile } from '@shared/types'
import type { RemoteCache } from '../lib/remoteCache'
import Glyph from './Glyph'

type Props = {
  home: string
  cwd: string
  showHidden: boolean
  cache: RemoteCache
  listingsVersion: number
  onGoTo: (path: string) => void
  onEnsure: (path: string) => Promise<boolean>
  onContextMenu?: (event: ReactMouseEvent, file: RemoteFile) => void
  query?: string
  extraHits?: { name: string; path: string }[]
  searching?: boolean
}

function ancestorPaths(path: string): string[] {
  const segs = pathSegments(path)
  const paths = ['/']
  for (let i = 0; i < segs.length; i += 1) paths.push(`/${segs.slice(0, i + 1).join('/')}`)
  return paths
}

function isUnder(parent: string, child: string): boolean {
  const root = normalizePath(parent)
  const target = normalizePath(child)
  if (root === '/') return true
  return target === root || target.startsWith(`${root}/`)
}

function asFolder(path: string, name: string): RemoteFile {
  return {
    name,
    path: normalizePath(path),
    isDirectory: true,
    isSymlink: false,
    size: 0,
    modifiedAt: 0,
    permissions: '',
  }
}

function foldersOf(listing: RemoteFile[] | undefined, showHidden: boolean): RemoteFile[] {
  if (!listing) return []
  return listing.filter((file) => {
    if (!file.isDirectory) return false
    if (!showHidden && file.name.startsWith('.')) return false
    return true
  })
}

export default function FolderTree({
  home,
  cwd,
  showHidden,
  cache,
  listingsVersion,
  onGoTo,
  onEnsure,
  onContextMenu,
  query = '',
  extraHits = [],
  searching = false,
}: Props) {
  const homePath = normalizePath(home)
  const cwdPath = normalizePath(cwd)
  const needle = query.trim().toLowerCase()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([homePath]))
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const roots = useMemo(() => {
    const items: { path: string; label: string; kind: 'home' | 'disk' }[] = [
      { path: homePath, label: 'Home', kind: 'home' },
    ]
    if (homePath !== '/') items.push({ path: '/', label: '/', kind: 'disk' })
    return items
  }, [homePath])

  const hitPaths = useMemo(
    () => extraHits.map((hit) => normalizePath(hit.path)),
    [extraHits],
  )

  useEffect(() => {
    const current = expandedRef.current
    const next = new Set(current)
    next.add(homePath)
    if (isUnder(homePath, cwdPath)) {
      for (const path of ancestorPaths(cwdPath)) {
        if (path === homePath || isUnder(homePath, path)) next.add(path)
      }
    } else {
      for (const path of ancestorPaths(cwdPath)) next.add(path)
    }
    for (const hit of hitPaths) {
      for (const path of ancestorPaths(hit)) next.add(path)
    }
    const same = next.size === current.size && [...next].every((path) => current.has(path))
    if (!same) setExpanded(next)
    for (const path of next) void onEnsure(path)
  }, [cwdPath, homePath, hitPaths, onEnsure])

  const visible = useMemo(() => {
    const memo = new Map<string, boolean>()
    function matches(label: string, path: string): boolean {
      if (!needle) return true
      return label.toLowerCase().includes(needle) || path.toLowerCase().includes(needle)
    }
    function check(path: string, label: string): boolean {
      const known = memo.get(path)
      if (known !== undefined) return known
      if (!needle) {
        memo.set(path, true)
        return true
      }
      if (matches(label, path)) {
        memo.set(path, true)
        return true
      }
      if (hitPaths.some((hit) => hit === path || isUnder(path, hit))) {
        memo.set(path, true)
        return true
      }
      const kids = foldersOf(cache.peekDir(path), showHidden)
      const ok = kids.some((child) => check(child.path, child.name))
      memo.set(path, ok)
      return ok
    }
    for (const root of roots) check(root.path, root.label)
    return memo
  }, [cache, hitPaths, listingsVersion, needle, roots, showHidden])

  function setFlag(setter: typeof setLoading, path: string, on: boolean) {
    setter((current) => {
      const next = new Set(current)
      if (on) next.add(path)
      else next.delete(path)
      return next
    })
  }

  async function toggle(path: string) {
    if (expanded.has(path)) {
      setExpanded((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
      return
    }
    setExpanded((current) => new Set(current).add(path))
    setFlag(setFailed, path, false)
    setFlag(setLoading, path, true)
    const ok = await onEnsure(path)
    setFlag(setLoading, path, false)
    if (!ok) setFlag(setFailed, path, true)
  }

  function node(path: string, label: string, kind: 'home' | 'disk' | 'folder', depth: number) {
    if (needle && !visible.get(path)) return null
    const listing = cache.peekDir(path)
    const kids = foldersOf(listing, showHidden).filter((child) => !needle || visible.get(child.path))
    const open = needle ? kids.length > 0 : expanded.has(path)
    const busy = loading.has(path)
    const error = failed.has(path)
    const current = cwdPath === path
    const loaded = listing !== undefined
    const canExpand = !loaded || kids.length > 0 || busy || error
    const nameMatch = needle && (label.toLowerCase().includes(needle) || path.toLowerCase().includes(needle))

    return (
      <div key={`${path}:${depth}`}>
        <div
          className={`group flex items-center gap-0.5 rounded-md pr-1 text-left text-[13px] ${
            current ? 'bg-ubuntu text-white' : 'text-white/80 hover:bg-white/8'
          }`}
          style={{ paddingLeft: 4 + depth * 10 }}
          onContextMenu={(event) => onContextMenu?.(event, asFolder(path, label))}
        >
          {canExpand ? (
            <button
              type="button"
              aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
              aria-expanded={open}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${current ? 'hover:bg-white/20' : 'text-white/45 hover:bg-white/10 hover:text-white/80'}`}
              onClick={(event) => {
                event.stopPropagation()
                if (needle) return
                void toggle(path)
              }}
            >
              {busy ? (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white/40 border-t-white" />
              ) : (
                <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="currentColor" aria-hidden>
                  <path d="M6.2 3.2a.75.75 0 0 1 1.3-.5l4.2 5a.75.75 0 0 1 0 .9l-4.2 5a.75.75 0 1 1-1.16-.96L9.8 8 6.34 4.16a.75.75 0 0 1-.14-.96z" />
                </svg>
              )}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          <button
            type="button"
            title={path}
            onClick={() => {
              onGoTo(path)
              if (!open && !needle) void toggle(path)
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
          >
            <Glyph kind={kind} className="h-3.5 w-3.5" />
            <span className={`truncate ${nameMatch && !current ? 'text-white' : ''}`}>{label}</span>
          </button>
        </div>
        {open && error ? <div className="px-2 py-0.5 text-[10px] text-red-300/80" style={{ paddingLeft: 28 + depth * 10 }}>Could not list this folder</div> : null}
        {open && !error && !loaded ? (
          <div className="py-0.5 text-[10px] text-white/35" style={{ paddingLeft: 28 + depth * 10 }}>
            Loading…
          </div>
        ) : null}
        {open && !error && loaded
          ? kids.map((child) => node(child.path, child.name, 'folder', depth + 1))
          : null}
      </div>
    )
  }

  const shownRoots = roots.filter((root) => !needle || visible.get(root.path))

  return (
    <div className="select-none">
      {shownRoots.length ? shownRoots.map((root) => node(root.path, root.label, root.kind, 0)) : (
        <p className="px-2 py-3 text-center text-[11px] leading-5 text-white/40">
          {searching ? 'Searching…' : 'No folders match.'}
        </p>
      )}
    </div>
  )
}
