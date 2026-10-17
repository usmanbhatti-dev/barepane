import { normalizePath, parentDir } from '@shared/paths'
import type { RemoteFile } from '@shared/types'

const MAX_DIRS = 80
const MAX_FILES = 40

export type CachedFile = {
  content: string
  size: number
  modifiedAt: number
}

function listingFingerprint(files: RemoteFile[]): string {
  return files
    .map((file) => `${file.name}\0${file.size}\0${file.modifiedAt}\0${file.permissions}\0${file.isDirectory ? 'd' : 'f'}`)
    .join('\n')
}

export function sameListing(left: RemoteFile[], right: RemoteFile[]): boolean {
  return listingFingerprint(left) === listingFingerprint(right)
}

export type FileSortKey = 'name' | 'size' | 'mtime' | 'path' | 'perm'
export type FileSortDir = 'asc' | 'desc'

export function sortFiles(files: RemoteFile[], key: FileSortKey = 'name', dir: FileSortDir = 'asc'): RemoteFile[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    let cmp = 0
    if (key === 'size') cmp = a.size - b.size
    else if (key === 'mtime') cmp = a.modifiedAt - b.modifiedAt
    else if (key === 'path') cmp = a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' })
    else if (key === 'perm') cmp = (a.permissions || '').localeCompare(b.permissions || '')
    else cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    return cmp * sign
  })
}

function touch<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

export class RemoteCache {
  private dirs = new Map<string, RemoteFile[]>()
  private files = new Map<string, CachedFile>()

  getDir(path: string): RemoteFile[] | undefined {
    const key = normalizePath(path)
    const cached = this.dirs.get(key)
    if (!cached) return undefined
    touch(this.dirs, key, cached, MAX_DIRS)
    return cached
  }

  peekDir(path: string): RemoteFile[] | undefined {
    return this.dirs.get(normalizePath(path))
  }

  setDir(path: string, files: RemoteFile[]): void {
    touch(this.dirs, normalizePath(path), files, MAX_DIRS)
  }

  getFile(path: string): CachedFile | undefined {
    const key = normalizePath(path)
    const cached = this.files.get(key)
    if (!cached) return undefined
    touch(this.files, key, cached, MAX_FILES)
    return cached
  }

  setFile(path: string, cached: CachedFile): void {
    touch(this.files, normalizePath(path), cached, MAX_FILES)
  }

  removeFile(path: string): void {
    this.files.delete(normalizePath(path))
  }

  invalidateTree(path: string): void {
    const key = normalizePath(path)
    this.dirs.delete(key)
    this.files.delete(key)
    for (const dir of [...this.dirs.keys()]) {
      if (dir === key || dir.startsWith(`${key}/`)) this.dirs.delete(dir)
    }
    for (const file of [...this.files.keys()]) {
      if (file === key || file.startsWith(`${key}/`)) this.files.delete(file)
    }
  }

  invalidateParent(path: string): void {
    this.dirs.delete(parentDir(normalizePath(path)))
  }

  clear(): void {
    this.dirs.clear()
    this.files.clear()
  }
}

const caches = new Map<string, RemoteCache>()

export function cacheFor(sessionId: string): RemoteCache {
  let cache = caches.get(sessionId)
  if (!cache) {
    cache = new RemoteCache()
    caches.set(sessionId, cache)
  }
  return cache
}

export function dropCache(sessionId: string): void {
  caches.delete(sessionId)
}

export function moveCache(fromId: string, toId: string): void {
  if (fromId === toId) return
  const cache = caches.get(fromId)
  if (!cache) return
  caches.delete(fromId)
  caches.set(toId, cache)
}
