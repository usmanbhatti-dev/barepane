import { defaultSessionName } from './sessions.ts'
import type { SavedJump, SavedSession } from './types.ts'

export type ParsedSshHost = {
  alias: string
  host: string
  port: number
  username: string
  privateKeyPath?: string
  forwardAgent?: boolean
  jump?: SavedJump
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function hasWildcard(value: string): boolean {
  return value.includes('*') || value.includes('?')
}

export function parseProxyJump(raw: string): SavedJump | null {
  const first = stripQuotes(raw.split(',')[0] || '')
  if (!first || hasWildcard(first)) return null
  let username = ''
  let rest = first
  const at = first.lastIndexOf('@')
  if (at > 0) {
    username = first.slice(0, at).trim()
    rest = first.slice(at + 1).trim()
  }
  if (!username || !rest) return null
  let host = rest
  let port = 22
  const bracket = rest.match(/^\[([^\]]+)\]:(\d+)$/)
  if (bracket) {
    host = bracket[1]
    port = Number(bracket[2])
  } else if (!rest.includes('::')) {
    const colon = rest.lastIndexOf(':')
    if (colon > 0) {
      const maybePort = Number(rest.slice(colon + 1))
      if (Number.isInteger(maybePort) && maybePort >= 1 && maybePort <= 65535) {
        host = rest.slice(0, colon)
        port = maybePort
      }
    }
  }
  if (!host) return null
  return { host, port, username, useAgent: true }
}

function keyword(line: string): { key: string; value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('Match ')) return null
  const match = trimmed.match(/^(\S+)\s+(.*)$/)
  if (!match) return null
  return { key: match[1].toLowerCase(), value: stripQuotes(match[2]) }
}

export function parseSshConfig(text: string, options?: { defaultUser?: string }): ParsedSshHost[] {
  const defaultUser = options?.defaultUser?.trim() || ''
  const hosts: ParsedSshHost[] = []
  let aliases: string[] = []
  let current: {
    hostName?: string
    user?: string
    port?: number
    identity?: string
    forwardAgent?: boolean
    jump?: SavedJump
  } | null = null

  function flush(): void {
    if (!current || !aliases.length) {
      current = null
      aliases = []
      return
    }
    const alias = aliases[0]
    const host = current.hostName || alias
    const username = current.user || defaultUser
    if (alias && host && username && !hasWildcard(alias) && !hasWildcard(host)) {
      const parsed: ParsedSshHost = {
        alias,
        host,
        port: current.port && Number.isInteger(current.port) ? current.port : 22,
        username,
      }
      if (current.identity) parsed.privateKeyPath = current.identity
      if (current.forwardAgent) parsed.forwardAgent = true
      if (current.jump) parsed.jump = current.jump
      hosts.push(parsed)
    }
    current = null
    aliases = []
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = keyword(rawLine)
    if (!parsed) {
      if (rawLine.trim().toLowerCase().startsWith('match ')) flush()
      continue
    }
    if (parsed.key === 'host') {
      flush()
      aliases = parsed.value.split(/\s+/).filter((name) => name && !hasWildcard(name))
      current = aliases.length ? {} : null
      continue
    }
    if (!current) continue
    if (parsed.key === 'hostname' && parsed.value) current.hostName = parsed.value
    else if (parsed.key === 'user' && parsed.value) current.user = parsed.value
    else if (parsed.key === 'port') {
      const port = Number(parsed.value)
      if (Number.isInteger(port) && port >= 1 && port <= 65535) current.port = port
    } else if (parsed.key === 'identityfile' && parsed.value) current.identity = parsed.value
    else if (parsed.key === 'forwardagent') current.forwardAgent = /^(yes|true|1)$/i.test(parsed.value)
    else if (parsed.key === 'proxyjump') {
      const jump = parseProxyJump(parsed.value)
      if (jump) current.jump = jump
    }
  }
  flush()
  return hosts
}

export function sshHostsToSessions(hosts: ParsedSshHost[]): SavedSession[] {
  return hosts.map((host) => {
    const session: SavedSession = {
      id: crypto.randomUUID(),
      name: host.alias || defaultSessionName(host.username, host.host),
      host: host.host,
      port: host.port,
      username: host.username,
      useAgent: true,
    }
    if (host.privateKeyPath) session.privateKeyPath = host.privateKeyPath
    if (host.forwardAgent) session.forwardAgent = true
    if (host.jump) session.jump = host.jump
    return session
  })
}
