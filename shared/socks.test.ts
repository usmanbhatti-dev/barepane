import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSocksGreeting, parseSocksRequest } from './socks.ts'

test('parses a SOCKS5 no-auth greeting', () => {
  const parsed = parseSocksGreeting(Buffer.from([5, 1, 0]))
  assert.deepEqual(parsed, { consumed: 3 })
  assert.deepEqual(parseSocksGreeting(Buffer.from([5, 1])), { need: 3 })
})

test('parses SOCKS5 CONNECT IPv4 and domain', () => {
  const ipv4 = parseSocksRequest(Buffer.from([5, 1, 0, 1, 127, 0, 0, 1, 0x01, 0xbb]))
  assert.ok('connect' in ipv4)
  if ('connect' in ipv4) {
    assert.equal(ipv4.connect.host, '127.0.0.1')
    assert.equal(ipv4.connect.port, 443)
  }
  const domain = Buffer.concat([Buffer.from([5, 1, 0, 3, 11]), Buffer.from('example.com'), Buffer.from([0, 80])])
  const parsed = parseSocksRequest(domain)
  assert.ok('connect' in parsed)
  if ('connect' in parsed) {
    assert.equal(parsed.connect.host, 'example.com')
    assert.equal(parsed.connect.port, 80)
  }
})
