export type KnownHost = {
  host: string
  port: number
  fingerprint: string
  seenAt: number
}

export function hostKeyId(host: string, port: number): string {
  return `${host.trim().toLowerCase()}|${port}`
}

export function parseKnownHosts(raw: unknown): Record<string, KnownHost> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, KnownHost> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const item = value as Record<string, unknown>
    const host = typeof item.host === 'string' ? item.host.trim() : ''
    const port = typeof item.port === 'number' ? item.port : Number(item.port)
    const fingerprint = typeof item.fingerprint === 'string' ? item.fingerprint.trim() : ''
    const seenAt = typeof item.seenAt === 'number' ? item.seenAt : Date.now()
    if (!host || !fingerprint || !Number.isInteger(port) || port < 1 || port > 65535) continue
    out[id || hostKeyId(host, port)] = { host, port, fingerprint, seenAt }
  }
  return out
}

export function sameFingerprint(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export const HOST_KEY_REJECTED = 'The SSH host key was not trusted. Connection cancelled.'
export const HOST_KEY_CHANGED = 'The SSH host key changed. Connection cancelled.'
