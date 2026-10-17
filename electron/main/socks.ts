import type { Duplex } from 'node:stream'
import type { Socket } from 'node:net'
import {
  parseSocksGreeting,
  parseSocksRequest,
  SOCKS_CONNECT_FAIL,
  SOCKS_CONNECT_OK,
  SOCKS_NO_AUTH,
} from '../../shared/socks'

export function handleSocksConnection(
  socket: Socket,
  connect: (host: string, port: number) => Promise<Duplex>,
): void {
  let buffer = Buffer.alloc(0)
  let step: 'greeting' | 'request' | 'pipe' = 'greeting'
  const timer = setTimeout(() => fail(), 8000)

  const fail = () => {
    clearTimeout(timer)
    socket.off('data', onData)
    try {
      if (step !== 'pipe') socket.write(SOCKS_CONNECT_FAIL)
    } catch {
      // ignore
    }
    socket.destroy()
  }

  const onData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    if (step === 'pipe') return
    if (step === 'greeting') {
      const parsed = parseSocksGreeting(buffer)
      if ('error' in parsed) {
        fail()
        return
      }
      if ('need' in parsed) return
      buffer = buffer.subarray(parsed.consumed)
      socket.write(SOCKS_NO_AUTH)
      step = 'request'
    }
    if (step !== 'request') return
    const parsed = parseSocksRequest(buffer)
    if ('error' in parsed) {
      fail()
      return
    }
    if ('need' in parsed) return
    buffer = buffer.subarray(parsed.consumed)
    step = 'pipe'
    clearTimeout(timer)
    void connect(parsed.connect.host, parsed.connect.port)
      .then((stream) => {
        socket.off('data', onData)
        socket.write(SOCKS_CONNECT_OK)
        if (buffer.length) stream.write(buffer)
        socket.pipe(stream)
        stream.pipe(socket)
      })
      .catch(() => fail())
  }

  socket.on('data', onData)
  socket.on('error', fail)
  socket.on('close', () => clearTimeout(timer))
}
