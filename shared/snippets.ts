import { STORAGE } from './storage.ts'

export type CommandSnippet = {
  id: string
  name: string
  command: string
}

export const SNIPPETS_KEY = STORAGE.snippets
export const MAX_SNIPPETS = 60
export const MAX_NAME = 48
export const MAX_COMMAND = 4000

export const DEFAULT_SNIPPETS: CommandSnippet[] = [
  { id: 'ls', name: 'ls -la', command: 'ls -la' },
  { id: 'pwd', name: 'pwd', command: 'pwd' },
  { id: 'df', name: 'df -h', command: 'df -h' },
  { id: 'free', name: 'free -h', command: 'free -h' },
  { id: 'uptime', name: 'uptime', command: 'uptime' },
  { id: 'htop', name: 'htop', command: 'htop' },
  { id: 'docker-ps', name: 'docker ps', command: 'docker ps' },
  { id: 'systemctl', name: 'systemctl', command: 'systemctl --type=service --state=running' },
  { id: 'journalctl', name: 'journalctl', command: 'journalctl -n 50 --no-pager' },
]

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function parseSnippet(raw: unknown): CommandSnippet | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = asString(item.name).trim()
  const command = asString(item.command).replace(/^\s+|\s+$/g, '')
  if (!name || !command) return null
  if (name.length > MAX_NAME || command.length > MAX_COMMAND) return null
  const id = asString(item.id).trim() || crypto.randomUUID()
  return { id, name, command }
}

export function parseSnippets(raw: unknown): CommandSnippet[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const list: CommandSnippet[] = []
  for (const item of raw) {
    const snippet = parseSnippet(item)
    if (!snippet || seen.has(snippet.id)) continue
    seen.add(snippet.id)
    list.push(snippet)
    if (list.length >= MAX_SNIPPETS) break
  }
  return list
}

export function upsertSnippet(list: CommandSnippet[], next: CommandSnippet): CommandSnippet[] {
  const parsed = parseSnippet(next)
  if (!parsed) return list
  const index = list.findIndex((item) => item.id === parsed.id)
  if (index === -1) return [...list, parsed].slice(0, MAX_SNIPPETS)
  const copy = [...list]
  copy[index] = parsed
  return copy
}

export function deleteSnippet(list: CommandSnippet[], id: string): CommandSnippet[] {
  return list.filter((item) => item.id !== id)
}
