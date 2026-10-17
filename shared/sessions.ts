import { STORAGE } from './storage.ts'
import type { SavedJump, SavedSession } from './types'

export const SESSIONS_KEY = STORAGE.sessions
export const LAST_CONNECTION_KEY = STORAGE.lastConnection

const MAX_SESSIONS = 80

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asPort(value: unknown): number {
  const port = typeof value === 'number' ? value : Number(asString(value) || '22')
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 22
  return port
}

function asId(value: unknown): string {
  const id = asString(value)
  return id || crypto.randomUUID()
}

export function defaultSessionName(username: string, host: string): string {
  const user = username.trim()
  const target = host.trim()
  if (user && target) return `${user}@${target}`
  return target || user || 'Server'
}

function parseJump(raw: unknown): SavedJump | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const jump = raw as Record<string, unknown>
  const host = asString(jump.host)
  const username = asString(jump.username)
  if (!host || !username) return undefined
  const parsed: SavedJump = {
    host,
    port: asPort(jump.port),
    username,
  }
  const keyPath = asString(jump.privateKeyPath)
  if (keyPath) parsed.privateKeyPath = keyPath
  if (jump.useAgent !== false) parsed.useAgent = true
  else parsed.useAgent = false
  if (jump.forwardAgent === true) parsed.forwardAgent = true
  return parsed
}

export function parseSavedSession(raw: unknown): SavedSession | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const host = asString(item.host)
  const username = asString(item.username)
  if (!host || !username) return null
  const session: SavedSession = {
    id: asId(item.id),
    name: asString(item.name) || defaultSessionName(username, host),
    host,
    port: asPort(item.port),
    username,
    useAgent: item.useAgent !== false,
  }
  if (item.forwardAgent === true) session.forwardAgent = true
  const keyPath = asString(item.privateKeyPath)
  if (keyPath) session.privateKeyPath = keyPath
  const jump = parseJump(item.jump)
  if (jump) session.jump = jump
  return session
}

export function parseSavedSessions(raw: unknown): SavedSession[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const sessions: SavedSession[] = []
  for (const item of raw) {
    const session = parseSavedSession(item)
    if (!session || seen.has(session.id)) continue
    seen.add(session.id)
    sessions.push(session)
    if (sessions.length >= MAX_SESSIONS) break
  }
  return sessions
}

export function upsertSavedSession(list: SavedSession[], next: SavedSession): SavedSession[] {
  const parsed = parseSavedSession(next)
  if (!parsed) return list
  const index = list.findIndex((item) => item.id === parsed.id)
  const copy = [...list]
  if (index === -1) return [parsed, ...copy].slice(0, MAX_SESSIONS)
  copy[index] = parsed
  copy.splice(index, 1)
  return [parsed, ...copy]
}

export function deleteSavedSession(list: SavedSession[], id: string): SavedSession[] {
  return list.filter((item) => item.id !== id)
}

export function sessionFingerprint(session: Pick<SavedSession, 'username' | 'host' | 'port'>): string {
  return `${session.username}@${session.host}:${session.port}`
}

export const SERVERS_EXPORT_KIND = 'barepane.servers'
const LEGACY_SERVERS_EXPORT_KIND = 'ubuntu-gui.servers'

export function serializeSavedSessions(list: SavedSession[]): string {
  return JSON.stringify(
    {
      v: 1,
      kind: SERVERS_EXPORT_KIND,
      sessions: parseSavedSessions(list),
    },
    null,
    2,
  )
}

export function parseServersExport(raw: unknown): SavedSession[] {
  if (Array.isArray(raw)) return parseSavedSessions(raw)
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  if (typeof obj.kind === 'string' && obj.kind !== SERVERS_EXPORT_KIND && obj.kind !== LEGACY_SERVERS_EXPORT_KIND) return []
  return parseSavedSessions(obj.sessions)
}

export function mergeSavedSessions(current: SavedSession[], incoming: SavedSession[]): SavedSession[] {
  let list = current
  for (const item of incoming) {
    const match = list.find((session) => sessionFingerprint(session) === sessionFingerprint(item))
    list = upsertSavedSession(list, match ? { ...item, id: match.id } : item)
  }
  return list
}
