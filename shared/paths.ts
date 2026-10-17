export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

export function normalizePath(target: string): string {
  const cleaned = target.replaceAll('\\', '/').replace(/\/+/g, '/')
  if (cleaned === '/') return '/'
  const parts: string[] = []
  for (const part of cleaned.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return `/${parts.join('/')}`
}

export function joinPath(dir: string, name: string): string {
  if (dir === '/') return normalizePath(`/${name}`)
  return normalizePath(`${dir}/${name}`)
}

export function parentDir(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

export function pathSegments(path: string): string[] {
  const normalized = normalizePath(path)
  if (normalized === '/') return []
  return normalized.slice(1).split('/')
}

export function validateName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required')
  if (trimmed === '.' || trimmed === '..') throw new Error('Invalid name')
  if (/[\\/\0]/.test(trimmed)) throw new Error('Name cannot contain slashes')
  return trimmed
}

export function parseConnectionTarget(raw: string): { host: string; username?: string } {
  const trimmed = raw.trim()
  const at = trimmed.lastIndexOf('@')
  if (at > 0 && !trimmed.includes('://') && !trimmed.includes('/')) {
    return {
      username: trimmed.slice(0, at).trim() || undefined,
      host: trimmed.slice(at + 1).trim(),
    }
  }
  return { host: trimmed }
}
