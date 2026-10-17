import type { TunnelDraft, TunnelKind } from './types'

const MAX_TUNNELS = 16

function asKind(value: unknown): TunnelKind | null {
  return value === 'local' || value === 'remote' || value === 'socks' ? value : null
}

function asPort(value: unknown): number | null {
  const port = typeof value === 'number' ? value : Number(String(value || '').trim())
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return port
}

function asHost(value: unknown, fallback = '127.0.0.1'): string {
  const host = typeof value === 'string' ? value.trim() : ''
  return host || fallback
}

export function parseTunnelDraft(raw: unknown): TunnelDraft {
  if (!raw || typeof raw !== 'object') throw new Error('Tunnel details are missing.')
  const item = raw as Record<string, unknown>
  const kind = asKind(item.kind)
  if (!kind) throw new Error('Choose local, remote, or SOCKS.')
  const listenPort = asPort(item.listenPort)
  if (!listenPort) throw new Error('Listen port must be between 1 and 65535.')
  if (kind === 'socks') return { kind, listenPort }
  const destPort = asPort(item.destPort)
  if (!destPort) throw new Error('Destination port must be between 1 and 65535.')
  return {
    kind,
    listenPort,
    destHost: asHost(item.destHost),
    destPort,
  }
}

export function parseTunnelDrafts(raw: unknown): TunnelDraft[] {
  if (!Array.isArray(raw)) return []
  const list: TunnelDraft[] = []
  for (const item of raw) {
    try {
      list.push(parseTunnelDraft(item))
    } catch {
      // skip invalid
    }
    if (list.length >= MAX_TUNNELS) break
  }
  return list
}

export function parseLocalHttpUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('URL is missing.')
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new Error('URL is not valid.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http URLs can be opened.')
  }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('Only localhost URLs can be opened.')
  }
  if (parsed.username || parsed.password) throw new Error('URL must not include credentials.')
  return parsed.href
}

export function tunnelLabel(tunnel: TunnelDraft): string {
  if (tunnel.kind === 'socks') return `SOCKS 127.0.0.1:${tunnel.listenPort}`
  const dest = `${tunnel.destHost || '127.0.0.1'}:${tunnel.destPort}`
  if (tunnel.kind === 'remote') return `R ${tunnel.listenPort} ← ${dest}`
  return `L ${tunnel.listenPort} → ${dest}`
}
