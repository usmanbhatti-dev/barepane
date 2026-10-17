export type SocksConnect = {
  host: string
  port: number
}

function readU16(buffer: Uint8Array, offset: number): number {
  return ((buffer[offset] ?? 0) << 8) | (buffer[offset + 1] ?? 0)
}

export function parseSocksGreeting(buffer: Uint8Array): { consumed: number } | { need: number } | { error: string } {
  if (buffer.length < 2) return { need: 2 }
  const version = buffer[0]
  const count = buffer[1] ?? 0
  if (version !== 5) return { error: 'Only SOCKS5 is supported.' }
  if (buffer.length < 2 + count) return { need: 2 + count }
  let allowsNoAuth = false
  for (let i = 0; i < count; i += 1) {
    if (buffer[2 + i] === 0) allowsNoAuth = true
  }
  if (!allowsNoAuth) return { error: 'SOCKS5 requires no-auth (method 0).' }
  return { consumed: 2 + count }
}

export function parseSocksRequest(buffer: Uint8Array): { connect: SocksConnect; consumed: number } | { need: number } | { error: string } {
  if (buffer.length < 7) return { need: 7 }
  if (buffer[0] !== 5) return { error: 'Only SOCKS5 is supported.' }
  if (buffer[1] !== 1) return { error: 'SOCKS5 CONNECT is the only supported command.' }
  const atyp = buffer[3]
  if (atyp === 1) {
    if (buffer.length < 10) return { need: 10 }
    const host = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`
    return { connect: { host, port: readU16(buffer, 8) }, consumed: 10 }
  }
  if (atyp === 3) {
    if (buffer.length < 5) return { need: 5 }
    const length = buffer[4] ?? 0
    if (buffer.length < 5 + length + 2) return { need: 5 + length + 2 }
    const host = new TextDecoder().decode(buffer.subarray(5, 5 + length))
    if (!host) return { error: 'SOCKS5 domain is empty.' }
    return { connect: { host, port: readU16(buffer, 5 + length) }, consumed: 5 + length + 2 }
  }
  if (atyp === 4) {
    if (buffer.length < 22) return { need: 22 }
    const parts: string[] = []
    for (let i = 0; i < 8; i += 1) parts.push(readU16(buffer, 4 + i * 2).toString(16))
    return { connect: { host: parts.join(':'), port: readU16(buffer, 20) }, consumed: 22 }
  }
  return { error: 'Unsupported SOCKS5 address type.' }
}

export const SOCKS_NO_AUTH = new Uint8Array([5, 0])
export const SOCKS_CONNECT_OK = new Uint8Array([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])
export const SOCKS_CONNECT_FAIL = new Uint8Array([5, 5, 0, 1, 0, 0, 0, 0, 0, 0])
