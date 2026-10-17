import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { formatSshError } from '@shared/errors'
import { joinPath, parentDir, pathSegments, validateName } from '@shared/paths'
import { STORAGE, bookmarksKey } from '@shared/storage'
import type { ContentHit, RemoteFile } from '@shared/types'
import { formatSize, formatTime, isEditable, MAX_EDIT_BYTES } from '../lib/files'
import { cacheFor, sameListing, sortFiles, type FileSortDir, type FileSortKey } from '../lib/remoteCache'
import FileContextMenu, { type MenuItem } from './FileContextMenu'
import FileDialog from './FileDialog'
import FolderTree from './FolderTree'
import Glyph from './Glyph'

type DialogState =
  | { type: 'new-file' }
  | { type: 'new-folder' }
  | { type: 'rename'; file: RemoteFile }
  | { type: 'delete'; file: RemoteFile }
  | { type: 'delete-many'; files: RemoteFile[] }
  | { type: 'chmod'; file: RemoteFile }

type MenuState = {
  x: number
  y: number
  file: RemoteFile | null
}

type HistoryState = {
  stack: string[]
  index: number
}

type NoticeKind = 'ok' | 'error' | 'info'

type Props = {
  sessionId: string
  bookmarkScope: string
  home: string
  cwd: string
  onCwdChange: (path: string) => void
  onOpenInTerminal: (path: string) => void
  onFollowLog?: (path: string) => void
  onOpenFile: (file: RemoteFile, options?: { line?: number }) => void
  onFileRenamed?: (fromPath: string, toPath: string, name: string) => void
  onFileDeleted?: (path: string) => void
  onNotice: (message: string, kind?: NoticeKind) => void
  elevate: <T>(run: (sudoPassword?: string) => Promise<T>) => Promise<T>
  active?: boolean
}

export default function FileExplorer({
  sessionId,
  bookmarkScope,
  home,
  cwd,
  onCwdChange,
  onOpenInTerminal,
  onFollowLog,
  onOpenFile,
  onFileRenamed,
  onFileDeleted,
  onNotice,
  elevate,
  active = true,
}: Props) {
  const cache = cacheFor(sessionId)
  const [files, setFiles] = useState<RemoteFile[]>(() => cacheFor(sessionId).getDir(cwd) ?? [])
  const [busy, setBusy] = useState(() => !cacheFor(sessionId).getDir(cwd))
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [showHidden, setShowHidden] = useState(() => localStorage.getItem(STORAGE.hidden) === '1')
  const [selected, setSelected] = useState<string[]>([])
  const [history, setHistory] = useState<HistoryState>({ stack: [home], index: 0 })
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'names' | 'contents'>('names')
  const [treeResults, setTreeResults] = useState<RemoteFile[] | null>(null)
  const [contentHits, setContentHits] = useState<ContentHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [dialogError, setDialogError] = useState('')
  const [targetDir, setTargetDir] = useState(cwd)
  const [freshPaths, setFreshPaths] = useState<Set<string>>(() => new Set())
  const [bookmarks, setBookmarks] = useState<{ label: string; path: string }[]>(() => loadBookmarks(bookmarkScope))
  const [treeRev, setTreeRev] = useState(0)
  const [treeQuery, setTreeQuery] = useState('')
  const [treeHits, setTreeHits] = useState<{ name: string; path: string }[]>([])
  const [treeSearching, setTreeSearching] = useState(false)
  const [sortKey, setSortKey] = useState<FileSortKey>('name')
  const [sortDir, setSortDir] = useState<FileSortDir>('asc')
  const paneRef = useRef<HTMLDivElement | null>(null)
  const cwdRef = useRef(cwd)
  const dirSeq = useRef(0)
  const filesRef = useRef(files)
  cwdRef.current = cwd
  filesRef.current = files

  const bumpTree = useCallback(() => setTreeRev((n) => n + 1), [])

  const ensureTreeDir = useCallback(async (path: string) => {
    if (cache.peekDir(path)) return true
    try {
      const next = await window.barepane.listDir(sessionId, path)
      const prev = cache.peekDir(path)
      cache.setDir(path, next)
      if (!prev || !sameListing(prev, next)) bumpTree()
      return true
    } catch {
      bumpTree()
      return false
    }
  }, [bumpTree, sessionId])

  const loadDir = useCallback(async (path: string, options?: { quiet?: boolean }) => {
    const seq = ++dirSeq.current
    const cached = cache.peekDir(path)
    if (cached) {
      if (path === cwdRef.current) {
        setFiles((current) => (sameListing(current, cached) ? current : cached))
        setBusy(false)
        setError('')
      }
    } else if (!options?.quiet) {
      setBusy(true)
    }
    if (!options?.quiet) setSyncing(true)
    try {
      const next = await window.barepane.listDir(sessionId, path)
      if (seq !== dirSeq.current) return
      const prev = cache.peekDir(path)
      cache.setDir(path, next)
      if (!prev || !sameListing(prev, next)) bumpTree()
      if (path !== cwdRef.current) return
      const current = filesRef.current
      if (!sameListing(current, next)) {
        const known = new Set(current.map((file) => file.path))
        const added = next.filter((file) => !known.has(file.path)).map((file) => file.path)
        if (added.length) {
          setFreshPaths(new Set(added))
          window.setTimeout(() => setFreshPaths(new Set()), 650)
        }
        setFiles(next)
      }
      setError('')
    } catch (err) {
      if (seq !== dirSeq.current) return
      if (cached) {
        onNotice(formatSshError(err), 'error')
      } else {
        setFiles([])
        setError(formatSshError(err))
      }
    } finally {
      if (seq === dirSeq.current) {
        setBusy(false)
        setSyncing(false)
      }
    }
  }, [bumpTree, onNotice, sessionId])

  useEffect(() => {
    if (!active) return
    const cached = cache.peekDir(cwd)
    if (cached) {
      setFiles(cached)
      setBusy(false)
      setError('')
    }
    void loadDir(cwd)
  }, [cwd, loadDir, active])

  useEffect(() => {
    if (!active) return
    const poll = () => {
      if (document.visibilityState === 'hidden') return
      void loadDir(cwdRef.current, { quiet: true })
    }
    const timer = window.setInterval(poll, 20000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [loadDir, active])

  useEffect(() => {
    localStorage.setItem(STORAGE.hidden, showHidden ? '1' : '0')
  }, [showHidden])

  useEffect(() => {
    const trimmed = treeQuery.trim()
    if (trimmed.length < 3) {
      setTreeHits([])
      setTreeSearching(false)
      return
    }
    let cancelled = false
    setTreeSearching(true)
    const timer = window.setTimeout(() => {
      void window.barepane
        .search(sessionId, home, trimmed, { dirsOnly: true, maxDepth: 4, limit: 60 })
        .then((results) => {
          if (cancelled) return
          setTreeHits(results.slice(0, 40).map((file) => ({ name: file.name, path: file.path })))
        })
        .catch(() => {
          if (!cancelled) setTreeHits([])
        })
        .finally(() => {
          if (!cancelled) setTreeSearching(false)
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [sessionId, treeQuery, home])

  const listing = treeResults ?? files
  const selectedSet = new Set(selected)
  const filtered = sortFiles(
    listing.filter((file) => {
      if (!showHidden && file.name.startsWith('.')) return false
      if (treeResults) return true
      if (!query.trim()) return true
      return file.name.toLowerCase().includes(query.trim().toLowerCase())
    }),
    treeResults && sortKey === 'size' ? 'path' : sortKey,
    sortDir,
  )
  const selectedFiles = filtered.filter((file) => selectedSet.has(file.path))
  const selectedFile = [...selected].reverse().map((path) => filtered.find((file) => file.path === path)).find(Boolean) ?? null

  function toggleSort(key: FileSortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }
  const crumbs = pathSegments(cwd)
  const canBack = history.index > 0
  const canForward = history.index < history.stack.length - 1
  const folderNeedle = treeQuery.trim().toLowerCase()
  const shownBookmarks = folderNeedle
    ? bookmarks.filter(
        (bookmark) =>
          bookmark.label.toLowerCase().includes(folderNeedle) || bookmark.path.toLowerCase().includes(folderNeedle),
      )
    : bookmarks

  function showCached(path: string) {
    const cached = cache.getDir(path)
    if (!cached) return
    setFiles(cached)
    setBusy(false)
    setError('')
  }

  function goTo(path: string, record = true) {
    setSelected([])
    setTreeResults(null)
    setQuery('')
    showCached(path)
    onCwdChange(path)
    if (!record) return
    setHistory((current) => {
      const stack = [...current.stack.slice(0, current.index + 1), path]
      return { stack, index: stack.length - 1 }
    })
  }

  function goBack() {
    if (!canBack) return
    const nextIndex = history.index - 1
    setHistory((current) => ({ ...current, index: nextIndex }))
    setTreeResults(null)
    setQuery('')
    setSelected([])
    showCached(history.stack[nextIndex])
    onCwdChange(history.stack[nextIndex])
  }

  function goForward() {
    if (!canForward) return
    const nextIndex = history.index + 1
    setHistory((current) => ({ ...current, index: nextIndex }))
    setTreeResults(null)
    setQuery('')
    setSelected([])
    showCached(history.stack[nextIndex])
    onCwdChange(history.stack[nextIndex])
  }

  function selectFiles(file: RemoteFile, event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) {
    if (event?.metaKey || event?.ctrlKey) {
      setSelected((current) => (current.includes(file.path) ? current.filter((path) => path !== file.path) : [...current, file.path]))
      return
    }
    if (event?.shiftKey && selected.length) {
      const anchor = selected[selected.length - 1]
      const start = filtered.findIndex((item) => item.path === anchor)
      const end = filtered.findIndex((item) => item.path === file.path)
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start]
        setSelected(filtered.slice(from, to + 1).map((item) => item.path))
        return
      }
    }
    setSelected([file.path])
  }

  async function openFile(file: RemoteFile) {
    setSelected([file.path])
    setMenu(null)
    if (file.isDirectory) {
      goTo(file.path)
      return
    }
    if (file.size > MAX_EDIT_BYTES) {
      onNotice(`${file.name} is too large to edit (${formatSize(file.size)}). Download it instead.`, 'error')
      return
    }
    if (file.size > 0 && !isEditable(file)) {
      onNotice(`${file.name} looks like a binary file. Download it instead.`, 'error')
      return
    }
    onOpenFile(file)
  }

  function patchDir(directory: string, patch: (current: RemoteFile[]) => RemoteFile[]) {
    if (directory === cwdRef.current) {
      setFiles((live) => {
        const next = sortFiles(patch(live))
        cache.setDir(directory, next)
        return next
      })
      bumpTree()
      return
    }
    cache.setDir(directory, sortFiles(patch(cache.getDir(directory) ?? [])))
    bumpTree()
  }

  async function createItem(kind: 'file' | 'folder', name: string, directory = cwd) {
    try {
      const nextName = validateName(name)
      const target = joinPath(directory, nextName)
      if (kind === 'folder') {
        await elevate((sudoPassword) => window.barepane.mkdir(sessionId, target, sudoPassword))
        onNotice(`Created folder ${nextName}`, 'ok')
      } else {
        const now = Date.now()
        await elevate((sudoPassword) => window.barepane.writeFile(sessionId, target, '', sudoPassword))
        cache.setFile(target, { content: '', size: 0, modifiedAt: now })
        onNotice(`Created ${nextName}`, 'ok')
        onOpenFile({
          name: nextName,
          path: target,
          isDirectory: false,
          isSymlink: false,
          size: 0,
          modifiedAt: now,
          permissions: '644',
        })
      }
      patchDir(directory, (current) => [
        ...current.filter((item) => item.path !== target),
        {
          name: nextName,
          path: target,
          isDirectory: kind === 'folder',
          isSymlink: false,
          size: 0,
          modifiedAt: Date.now(),
          permissions: kind === 'folder' ? '755' : '644',
        },
      ])
      setFreshPaths(new Set([target]))
      window.setTimeout(() => setFreshPaths(new Set()), 650)
      setDialog(null)
      setDialogError('')
      setSelected([target])
      if (directory !== cwd) goTo(directory)
      else void loadDir(directory)
    } catch (err) {
      setDialogError(formatSshError(err))
    }
  }

  async function renameItem(file: RemoteFile, name: string) {
    try {
      const nextName = validateName(name)
      const target = joinPath(parentDir(file.path), nextName)
      await elevate((sudoPassword) => window.barepane.rename(sessionId, file.path, target, sudoPassword))
      const cachedFile = cache.getFile(file.path)
      if (cachedFile) {
        cache.removeFile(file.path)
        cache.setFile(target, cachedFile)
      }
      if (file.isDirectory) cache.invalidateTree(file.path)
      onFileRenamed?.(file.path, target, nextName)
      patchDir(parentDir(file.path), (current) =>
        current.map((item) => (item.path === file.path ? { ...item, name: nextName, path: target } : item)),
      )
      setDialog(null)
      setDialogError('')
      setSelected([target])
      onNotice(`Renamed to ${nextName}`, 'ok')
      void loadDir(parentDir(file.path))
    } catch (err) {
      setDialogError(formatSshError(err))
    }
  }

  async function deleteItem(file: RemoteFile) {
    try {
      await elevate((sudoPassword) => window.barepane.remove(sessionId, file.path, sudoPassword))
      cache.removeFile(file.path)
      if (file.isDirectory) cache.invalidateTree(file.path)
      patchDir(parentDir(file.path), (current) => current.filter((item) => item.path !== file.path))
      onFileDeleted?.(file.path)
      setDialog(null)
      setSelected([])
      onNotice(`Deleted ${file.name}`, 'ok')
      void loadDir(parentDir(file.path))
    } catch (err) {
      setDialogError(formatSshError(err))
      onNotice(formatSshError(err), 'error')
    }
  }

  async function deleteItems(files: RemoteFile[]) {
    try {
      for (const file of files) {
        await elevate((sudoPassword) => window.barepane.remove(sessionId, file.path, sudoPassword))
        cache.removeFile(file.path)
        if (file.isDirectory) cache.invalidateTree(file.path)
        patchDir(parentDir(file.path), (current) => current.filter((item) => item.path !== file.path))
        onFileDeleted?.(file.path)
      }
      setDialog(null)
      setSelected([])
      onNotice(`Deleted ${files.length} item${files.length === 1 ? '' : 's'}`, 'ok')
      void loadDir(cwd)
    } catch (err) {
      setDialogError(formatSshError(err))
      onNotice(formatSshError(err), 'error')
    }
  }

  async function runTreeSearch(event?: FormEvent) {
    event?.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) {
      setTreeResults(null)
      return
    }
    setSearching(true)
    try {
      if (searchMode === 'contents') {
        const hits = await window.barepane.grep(sessionId, cwd, trimmed, { maxDepth: 5, limit: 80 })
        setContentHits(hits)
        setTreeResults(null)
        onNotice(hits.length ? `${hits.length} lines under ${cwd}` : 'No text matches', hits.length ? 'info' : 'error')
      } else {
        const results = await window.barepane.search(sessionId, cwd, trimmed, { maxDepth: 5, limit: 120 })
        setTreeResults(results)
        setContentHits(null)
        onNotice(results.length ? `${results.length} matches under ${cwd}` : 'No matches', results.length ? 'info' : 'error')
      }
    } catch (err) {
      onNotice(formatSshError(err), 'error')
    } finally {
      setSearching(false)
    }
  }

  function openMenu(event: ReactMouseEvent, file: RemoteFile | null) {
    event.preventDefault()
    event.stopPropagation()
    if (file && !selected.includes(file.path)) setSelected([file.path])
    setMenu({ x: event.clientX, y: event.clientY, file })
  }

  function joinLocal(dir: string, name: string): string {
    const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
    return `${dir.replace(/[/\\]+$/, '')}${sep}${name}`
  }

  async function downloadItems(files: RemoteFile[]) {
    if (!files.length) {
      onNotice('Select files or folders to download', 'error')
      return
    }
    try {
      if (files.length === 1 && !files[0].isDirectory) {
        const local = await window.barepane.pickSavePath(files[0].name)
        if (!local) return
        await window.barepane.downloadFile(sessionId, files[0].path, local)
        onNotice(`Downloaded ${files[0].name}`, 'ok')
        return
      }
      const dir = await window.barepane.pickDirectory()
      if (!dir) return
      for (const file of files) {
        await window.barepane.downloadFile(sessionId, file.path, joinLocal(dir, file.name))
      }
      onNotice(`Downloaded ${files.length} item${files.length === 1 ? '' : 's'}`, 'ok')
    } catch (err) {
      onNotice(formatSshError(err), 'error')
    }
  }

  async function uploadItems(directory = cwd, localPaths?: string[]) {
    const paths = localPaths ?? (await window.barepane.pickOpenFiles())
    if (!paths.length) return
    try {
      for (const local of paths) {
        const name = local.split(/[/\\]/).pop() || 'upload'
        await elevate((sudoPassword) => window.barepane.uploadFile(sessionId, local, joinPath(directory, name), sudoPassword))
      }
      onNotice(`Uploaded ${paths.length} item${paths.length === 1 ? '' : 's'}`, 'ok')
      void loadDir(directory)
    } catch (err) {
      onNotice(formatSshError(err), 'error')
    }
  }

  async function chmodItem(file: RemoteFile, mode: string) {
    try {
      await elevate((sudoPassword) => window.barepane.chmod(sessionId, file.path, mode, sudoPassword))
      patchDir(parentDir(file.path), (current) =>
        current.map((item) => (item.path === file.path ? { ...item, permissions: mode.replace(/^0/, '').padStart(3, '0') } : item)),
      )
      setDialog(null)
      onNotice(`Permissions set to ${mode}`, 'ok')
      void loadDir(parentDir(file.path))
    } catch (err) {
      setDialogError(formatSshError(err))
    }
  }

  function toggleBookmark() {
    setBookmarks((current) => {
      const exists = current.some((item) => item.path === cwd)
      const next = exists
        ? current.filter((item) => item.path !== cwd)
        : [...current, { label: cwd === home ? 'Home' : pathSegments(cwd).at(-1) || cwd, path: cwd }]
      localStorage.setItem(bookmarksKey(bookmarkScope), JSON.stringify(next))
      onNotice(exists ? 'Bookmark removed' : 'Folder bookmarked', 'ok')
      return next
    })
  }

  function onPaneKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    if (event.key === 'Enter' && selectedFile) {
      event.preventDefault()
      void openFile(selectedFile)
    }
    if (event.key === 'Delete' && selectedFiles.length) {
      event.preventDefault()
      if (selectedFiles.length === 1) setDialog({ type: 'delete', file: selectedFiles[0] })
      else setDialog({ type: 'delete-many', files: selectedFiles })
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelected(filtered.map((file) => file.path))
    }
    if (event.key === 'F2' && selectedFile) {
      event.preventDefault()
      setDialog({ type: 'rename', file: selectedFile })
    }
    if (event.key === 'Escape') {
      setMenu(null)
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      document.getElementById('file-search')?.focus()
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault()
      setTargetDir(cwd)
      setDialog({ type: 'new-file' })
    }
  }

  const menuItems: MenuItem[] = menu?.file
    ? [
        {
          label: menu.file.isDirectory ? 'Open folder' : 'Open in tab',
          onClick: () => void openFile(menu.file!),
        },
        {
          label: selectedFiles.length > 1 ? `Download ${selectedFiles.length} items` : 'Download',
          onClick: () => void downloadItems(selectedFiles.length > 1 ? selectedFiles : [menu.file!]),
        },
        {
          label: 'Upload here',
          onClick: () => void uploadItems(menu.file!.isDirectory ? menu.file!.path : parentDir(menu.file!.path)),
        },
        {
          label: 'New file here',
          onClick: () => {
            setTargetDir(menu.file!.isDirectory ? menu.file!.path : parentDir(menu.file!.path))
            setDialogError('')
            setDialog({ type: 'new-file' })
          },
        },
        {
          label: 'New folder here',
          onClick: () => {
            setTargetDir(menu.file!.isDirectory ? menu.file!.path : parentDir(menu.file!.path))
            setDialogError('')
            setDialog({ type: 'new-folder' })
          },
        },
        { label: 'Rename', shortcut: 'F2', onClick: () => setDialog({ type: 'rename', file: menu.file! }) },
        {
          label: 'Permissions',
          onClick: () => {
            setDialogError('')
            setDialog({ type: 'chmod', file: menu.file! })
          },
        },
        {
          label: 'Copy path',
          onClick: () => {
            void navigator.clipboard.writeText(menu.file!.path)
            onNotice('Path copied', 'ok')
          },
        },
        {
          label: 'Open in terminal',
          onClick: () => onOpenInTerminal(menu.file!.isDirectory ? menu.file!.path : parentDir(menu.file!.path)),
        },
        {
          label: 'Follow log',
          disabled: menu.file.isDirectory || !onFollowLog,
          onClick: () => onFollowLog?.(menu.file!.path),
        },
        'separator',
        {
          label: selectedFiles.length > 1 ? `Delete ${selectedFiles.length} items` : 'Delete',
          shortcut: 'Del',
          danger: true,
          onClick: () => {
            if (selectedFiles.length > 1) setDialog({ type: 'delete-many', files: selectedFiles })
            else setDialog({ type: 'delete', file: menu.file! })
          },
        },
      ]
    : [
        { label: 'New file', shortcut: '⌘N', onClick: () => {
          setTargetDir(cwd)
          setDialogError('')
          setDialog({ type: 'new-file' })
        } },
        { label: 'New folder', onClick: () => {
          setTargetDir(cwd)
          setDialogError('')
          setDialog({ type: 'new-folder' })
        } },
        { label: 'Refresh', onClick: () => void loadDir(cwd) },
        { label: 'Upload files', onClick: () => void uploadItems(cwd) },
        { label: 'Bookmark folder', onClick: toggleBookmark },
        { label: 'Open terminal here', onClick: () => onOpenInTerminal(cwd) },
      ]

  return (
    <div ref={paneRef} className="flex h-full min-h-0 outline-none" tabIndex={0} onKeyDown={onPaneKey}>
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-surface-2">
        <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Folders
        </div>
        <div className="px-2 pb-2">
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/30 px-1.5">
            <Glyph kind="search" className="h-3.5 w-3.5" />
            <input
              id="folder-tree-search"
              value={treeQuery}
              onChange={(event) => setTreeQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setTreeQuery('')
                }
              }}
              placeholder="Find folders"
              className="min-w-0 flex-1 bg-transparent py-1 text-xs outline-none"
            />
            {treeSearching ? (
              <span className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-white/35 border-t-white" />
            ) : treeQuery ? (
              <button
                type="button"
                aria-label="Clear folder search"
                className="px-0.5 text-xs text-white/40 hover:text-white"
                onClick={() => setTreeQuery('')}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
          <FolderTree
            home={home}
            cwd={cwd}
            showHidden={showHidden}
            cache={cache}
            listingsVersion={treeRev}
            query={treeQuery}
            extraHits={treeHits}
            searching={treeSearching}
            onGoTo={goTo}
            onEnsure={ensureTreeDir}
            onContextMenu={(event, file) => openMenu(event, file)}
          />
          {shownBookmarks.length ? (
            <div className="mt-3 px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
              Bookmarks
            </div>
          ) : null}
          {shownBookmarks.map((bookmark) => (
            <button
              key={bookmark.path}
              type="button"
              onClick={() => goTo(bookmark.path)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                cwd === bookmark.path ? 'bg-accent text-white' : 'text-white/80 hover:bg-white/8'
              }`}
            >
              <Glyph kind="folder" />
              <span className="truncate">{bookmark.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-1">
            <IconButton label="Back" disabled={!canBack} onClick={goBack}>
              <NavIcon kind="back" />
            </IconButton>
            <IconButton label="Forward" disabled={!canForward} onClick={goForward}>
              <NavIcon kind="forward" />
            </IconButton>
            <IconButton label="Up" disabled={cwd === '/'} onClick={() => goTo(parentDir(cwd))}>
              <NavIcon kind="up" />
            </IconButton>
            <IconButton label="Refresh" onClick={() => void loadDir(cwd)} spinning={syncing}>
              ↻
            </IconButton>
          </div>
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md bg-black/35 px-2 py-1 font-mono text-xs text-white/75">
            <button type="button" className="shrink-0 hover:text-accent-fg" onClick={() => goTo('/')}>/</button>
            {crumbs.map((part, index) => {
              const path = `/${crumbs.slice(0, index + 1).join('/')}`
              return (
                <span key={path} className="flex min-w-0 items-center">
                  <button type="button" className="truncate hover:text-accent-fg" onClick={() => goTo(path)}>
                    {part}
                  </button>
                  {index < crumbs.length - 1 ? <span className="px-0.5 text-white/30">/</span> : null}
                </span>
              )
            })}
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-white/60">
            <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
            Hidden
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <form className="flex shrink-0 items-center gap-2" onSubmit={(event) => void runTreeSearch(event)}>
            <div className="flex w-[17.16rem] items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2">
              <Glyph kind="search" />
              <input
                id="file-search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  if (treeResults) setTreeResults(null)
                  if (contentHits) setContentHits(null)
                }}
                placeholder={searchMode === 'contents' ? 'Search inside files under this folder' : 'Filter this folder, or Search for nested names'}
                className="w-full bg-transparent py-1.5 text-xs outline-none"
              />
            </div>
            <div className="relative">
              <select
                value={searchMode}
                onChange={(event) => {
                  setSearchMode(event.target.value === 'contents' ? 'contents' : 'names')
                  setTreeResults(null)
                  setContentHits(null)
                }}
                className="appearance-none rounded-md border border-white/10 bg-black/30 py-1.5 pl-2.5 pr-8 text-xs text-white/80 outline-none"
              >
                <option value="names">Names</option>
                <option value="contents">In files</option>
              </select>
              <svg
                viewBox="0 0 16 16"
                className="pointer-events-none absolute top-1/2 right-2.5 h-3 w-3 -translate-y-1/2 text-white/50"
                fill="currentColor"
                aria-hidden
              >
                <path d="M4.2 6.2a.75.75 0 0 1 1.06 0L8 8.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L4.2 7.26a.75.75 0 0 1 0-1.06z" />
              </svg>
            </div>
            <button
              type="submit"
              title={searching ? 'Searching…' : 'Search'}
              aria-label={searching ? 'Searching' : 'Search'}
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/15 disabled:opacity-50"
              disabled={searching}
            >
              <Glyph kind="search" className="h-4 w-4 text-white/80" />
            </button>
          </form>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              title="New file"
              aria-label="New file"
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/15"
              onClick={() => {
                setTargetDir(cwd)
                setDialogError('')
                setDialog({ type: 'new-file' })
              }}
            >
              <Glyph kind="file-plus" />
            </button>
            <button
              type="button"
              title="New folder"
              aria-label="New folder"
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/15"
              onClick={() => {
                setTargetDir(cwd)
                setDialogError('')
                setDialog({ type: 'new-folder' })
              }}
            >
              <Glyph kind="folder-plus" />
            </button>
            <button
              type="button"
              title="Upload"
              aria-label="Upload"
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/15"
              onClick={() => void uploadItems(cwd)}
            >
              <Glyph kind="upload" />
            </button>
            <button
              type="button"
              title="Download"
              aria-label="Download"
              disabled={!selectedFiles.length}
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/15 disabled:opacity-30"
              onClick={() => void downloadItems(selectedFiles)}
            >
              <Glyph kind="download" />
            </button>
            <button
              type="button"
              title={bookmarks.some((item) => item.path === cwd) ? 'Unbookmark' : 'Bookmark'}
              aria-label={bookmarks.some((item) => item.path === cwd) ? 'Unbookmark' : 'Bookmark'}
              className="rounded-md bg-white/10 p-1.5 hover:bg-white/15"
              onClick={toggleBookmark}
            >
              <Glyph kind={bookmarks.some((item) => item.path === cwd) ? 'bookmark-on' : 'bookmark'} />
            </button>
            <button type="button" className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold" onClick={() => onOpenInTerminal(cwd)}>
              Terminal here
            </button>
          </div>
        </div>

        {treeResults || contentHits ? (
          <div className="flex items-center justify-between border-b border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/60">
            <span>
              {contentHits
                ? `${contentHits.length} text matches under ${cwd}`
                : `${treeResults?.length ?? 0} results under ${cwd}`}
            </span>
            <button
              type="button"
              className="hover:text-white"
              onClick={() => {
                setTreeResults(null)
                setContentHits(null)
                setQuery('')
              }}
            >
              Clear search
            </button>
          </div>
        ) : null}

        <div
          className="relative min-h-0 flex-1 overflow-auto"
          onContextMenu={(event) => openMenu(event, null)}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(event) => {
            event.preventDefault()
            const paths = [...event.dataTransfer.files]
              .map((file) => {
                try {
                  return window.barepane.getPathForFile(file)
                } catch {
                  return ''
                }
              })
              .filter(Boolean)
            if (paths.length) void uploadItems(cwd, paths)
            else onNotice('Drop files from Finder to upload', 'info')
          }}
        >
          {syncing ? <div className="file-sync-bar" /> : null}
          {busy && files.length === 0 ? (
            <div className="space-y-1 px-3 py-4">
              {Array.from({ length: 7 }, (_, index) => (
                <div key={index} className="file-skeleton h-8 rounded-md" />
              ))}
            </div>
          ) : null}
          {error && files.length === 0 ? <div className="px-4 py-6 text-sm text-red-300">{error}</div> : null}
          {contentHits ? (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Line</th>
                  <th className="px-3 py-2 font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {contentHits.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-white/40" colSpan={3}>No text matches.</td>
                  </tr>
                ) : (
                  contentHits.map((hit) => (
                    <tr
                      key={`${hit.path}:${hit.line}`}
                      className="file-row cursor-default hover:bg-white/5"
                      onDoubleClick={() =>
                        onOpenFile(
                          {
                            name: hit.name,
                            path: hit.path,
                            isDirectory: false,
                            isSymlink: false,
                            size: 0,
                            modifiedAt: 0,
                            permissions: '',
                          },
                          { line: hit.line },
                        )
                      }
                    >
                      <td className="max-w-[12rem] truncate px-3 py-1.5 text-white/88" title={hit.path}>{hit.name}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-white/50">{hit.line}</td>
                      <td className="max-w-[24rem] truncate px-3 py-1.5 font-mono text-xs text-white/60">{hit.text}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : files.length > 0 || (!busy && !error) ? (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wider text-white/40">
                <tr>
                  <SortHeader label="Name" column="name" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortHeader
                    label={treeResults ? 'Path' : 'Size'}
                    column={treeResults ? 'path' : 'size'}
                    active={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader label="Modified" column="mtime" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Perm" column="perm" active={sortKey} dir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-white/40" colSpan={4}>This folder is empty.</td>
                  </tr>
                ) : (
                  filtered.map((file) => (
                    <tr
                      key={file.path}
                      className={`file-row cursor-default ${freshPaths.has(file.path) ? 'file-row-enter' : ''} ${selectedSet.has(file.path) ? 'bg-accent/30' : 'hover:bg-white/5'}`}
                      onClick={(event) => selectFiles(file, event)}
                      onDoubleClick={() => void openFile(file)}
                      onContextMenu={(event) => openMenu(event, file)}
                    >
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <Glyph kind={file.isDirectory ? 'folder' : file.isSymlink ? 'link' : 'file'} />
                          <span className={file.isDirectory ? 'font-medium text-white' : 'text-white/88'}>{file.name}</span>
                        </span>
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-1.5 text-white/50">
                        {treeResults ? file.path : file.isDirectory ? '—' : formatSize(file.size)}
                      </td>
                      <td className="px-3 py-1.5 text-white/50">{formatTime(file.modifiedAt)}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-white/50">{file.permissions || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>

      {menu ? <FileContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} /> : null}

      {dialog?.type === 'new-file' ? (
        <FileDialog title="New file" input placeholder="notes.txt" confirmLabel="Create" error={dialogError} onCancel={() => setDialog(null)} onConfirm={(name) => void createItem('file', name, targetDir)} />
      ) : null}
      {dialog?.type === 'new-folder' ? (
        <FileDialog title="New folder" input placeholder="project" confirmLabel="Create" error={dialogError} onCancel={() => setDialog(null)} onConfirm={(name) => void createItem('folder', name, targetDir)} />
      ) : null}
      {dialog?.type === 'rename' ? (
        <FileDialog title="Rename" input defaultValue={dialog.file.name} confirmLabel="Rename" error={dialogError} onCancel={() => setDialog(null)} onConfirm={(name) => void renameItem(dialog.file, name)} />
      ) : null}
      {dialog?.type === 'delete' ? (
        <FileDialog title="Delete" danger confirmLabel="Delete" error={dialogError} message={`Delete “${dialog.file.name}”? This cannot be undone.`} onCancel={() => setDialog(null)} onConfirm={() => void deleteItem(dialog.file)} />
      ) : null}
      {dialog?.type === 'delete-many' ? (
        <FileDialog
          title="Delete"
          danger
          confirmLabel="Delete"
          error={dialogError}
          message={`Delete ${dialog.files.length} items? This cannot be undone.`}
          onCancel={() => setDialog(null)}
          onConfirm={() => void deleteItems(dialog.files)}
        />
      ) : null}
      {dialog?.type === 'chmod' ? (
        <FileDialog title="Permissions" input defaultValue={dialog.file.permissions || '644'} placeholder="755" confirmLabel="Apply" error={dialogError} message={`Unix mode for ${dialog.file.name}`} onCancel={() => setDialog(null)} onConfirm={(mode) => void chmodItem(dialog.file, mode)} />
      ) : null}
    </div>
  )
}

function SortHeader({
  label,
  column,
  active,
  dir,
  onSort,
}: {
  label: string
  column: FileSortKey
  active: FileSortKey
  dir: FileSortDir
  onSort: (key: FileSortKey) => void
}) {
  const selected = active === column
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 hover:text-white ${selected ? 'text-white/80' : ''}`}
      >
        {label}
        {selected ? <span className="text-[10px] text-accent-fg">{dir === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    </th>
  )
}

function NavIcon({ kind }: { kind: 'back' | 'forward' | 'up' }) {
  const path =
    kind === 'back'
      ? 'M10.2 3.2a.75.75 0 0 1 0 1.06L6.46 8l3.74 3.74a.75.75 0 1 1-1.06 1.06l-4.27-4.27a.75.75 0 0 1 0-1.06l4.27-4.27a.75.75 0 0 1 1.06 0z'
      : kind === 'forward'
        ? 'M5.8 3.2a.75.75 0 0 1 1.06 0l4.27 4.27a.75.75 0 0 1 0 1.06L6.86 12.8a.75.75 0 1 1-1.06-1.06L9.54 8 5.8 4.26a.75.75 0 0 1 0-1.06z'
        : 'M8 3.25a.75.75 0 0 1 .53.22l3.5 3.5a.75.75 0 1 1-1.06 1.06L8.75 5.56V12a.75.75 0 0 1-1.5 0V5.56L5.03 8.03a.75.75 0 0 1-1.06-1.06l3.5-3.5A.75.75 0 0 1 8 3.25z'
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 text-white/85" fill="currentColor" aria-hidden>
      <path d={path} />
    </svg>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
  spinning,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  spinning?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/10 hover:bg-white/15 disabled:opacity-30"
    >
      <span className={`inline-flex items-center justify-center text-[15px] leading-none ${spinning ? 'file-sync-spin' : ''}`}>{children}</span>
    </button>
  )
}

function loadBookmarks(scope: string): { label: string; path: string }[] {
  try {
    const raw = localStorage.getItem(bookmarksKey(scope))
    if (!raw) return []
    const parsed = JSON.parse(raw) as { label: string; path: string }[]
    return Array.isArray(parsed) ? parsed.filter((item) => item.path && item.label) : []
  } catch {
    return []
  }
}
