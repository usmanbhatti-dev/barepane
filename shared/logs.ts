import { normalizePath, shellQuote } from './paths.ts'
import type { LogDraft, LogKind, LogPriority, LogScope } from './types'

export const DEFAULT_LOG_LINES = 200
export const MAX_LOG_LINES = 2000
export const MAX_LOG_STREAMS = 4
export const MAX_UNIT = 256

export const LOG_PRIORITIES: LogPriority[] = [
  'emerg',
  'alert',
  'crit',
  'err',
  'warning',
  'notice',
  'info',
  'debug',
]

const UNIT_RE = /^[A-Za-z0-9:._@\\*-]{1,256}$/

function asKind(value: unknown): LogKind | null {
  return value === 'journal' || value === 'file' || value === 'docker' ? value : null
}

function asScope(value: unknown): LogScope {
  return value === 'user' ? 'user' : 'system'
}

function asPriority(value: unknown): LogPriority | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const next = String(value).trim()
  return LOG_PRIORITIES.includes(next as LogPriority) ? (next as LogPriority) : undefined
}

function asLines(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim() || DEFAULT_LOG_LINES)
  if (!Number.isInteger(n)) return DEFAULT_LOG_LINES
  return Math.min(MAX_LOG_LINES, Math.max(1, n))
}

function asUnit(value: unknown): string | undefined {
  const unit = typeof value === 'string' ? value.trim() : ''
  if (!unit) return undefined
  if (!UNIT_RE.test(unit) || unit.length > MAX_UNIT) {
    throw new Error('Unit name can only contain letters, numbers, and :._@*-')
  }
  return unit
}

function asContainer(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) {
    throw new Error('Container name can only contain letters, numbers, underscore, dot, and dash.')
  }
  return name
}

function asPath(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw || raw.includes('\0') || raw.includes('\n')) throw new Error('Log file path is required.')
  if (!raw.startsWith('/')) throw new Error('Log file path must be absolute.')
  const path = normalizePath(raw)
  if (path === '/') throw new Error('Log file path must be a file, not /.')
  return path
}

export function parseLogDraft(raw: unknown): LogDraft {
  if (!raw || typeof raw !== 'object') throw new Error('Log details are missing.')
  const item = raw as Record<string, unknown>
  const kind = asKind(item.kind)
  if (!kind) throw new Error('Choose journal, a log file, or a container.')
  const lines = asLines(item.lines)
  const sudo = item.sudo === true
  if (kind === 'file') {
    return { kind, path: asPath(item.path), lines, sudo }
  }
  if (kind === 'docker') {
    return { kind, container: asContainer(item.container), lines, sudo }
  }
  const priority = asPriority(item.priority)
  if (item.priority && !priority) throw new Error('Choose a valid journal priority.')
  return {
    kind: 'journal',
    scope: asScope(item.scope),
    unit: asUnit(item.unit),
    priority,
    lines,
    sudo,
  }
}

export function buildLogCommand(draft: LogDraft): string {
  const parsed = parseLogDraft(draft)
  if (parsed.kind === 'file') {
    return `tail -n ${parsed.lines} -F -- ${shellQuote(parsed.path || '')}`
  }
  if (parsed.kind === 'docker') {
    return `docker logs -f --tail ${parsed.lines} --timestamps ${shellQuote(parsed.container || '')}`
  }
  let command = `journalctl --no-pager --output=short-iso -n ${parsed.lines} -f`
  if (parsed.scope === 'user') command += ' --user'
  if (parsed.unit) command += ` -u ${shellQuote(parsed.unit)}`
  if (parsed.priority) command += ` -p ${shellQuote(parsed.priority)}`
  return command
}

export function logLabel(draft: Pick<LogDraft, 'kind' | 'unit' | 'path' | 'scope' | 'priority' | 'container'>): string {
  if (draft.kind === 'file') {
    const path = draft.path || ''
    const slash = path.lastIndexOf('/')
    return slash >= 0 ? path.slice(slash + 1) || path : path || 'file'
  }
  if (draft.kind === 'docker') return draft.container || 'container'
  const unit = draft.unit || (draft.scope === 'user' ? 'user journal' : 'journal')
  return draft.priority ? `${unit} (${draft.priority})` : unit
}
