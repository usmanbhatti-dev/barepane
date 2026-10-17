import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLocalHttpUrl, parseTunnelDraft, parseTunnelDrafts, tunnelLabel } from './tunnels.ts'

test('parses local, remote, and SOCKS tunnels', () => {
  assert.deepEqual(parseTunnelDraft({ kind: 'local', listenPort: '3306', destHost: '127.0.0.1', destPort: 3306 }), {
    kind: 'local',
    listenPort: 3306,
    destHost: '127.0.0.1',
    destPort: 3306,
  })
  assert.equal(parseTunnelDraft({ kind: 'socks', listenPort: 1080 }).kind, 'socks')
  assert.equal(tunnelLabel({ kind: 'remote', listenPort: 8080, destHost: '127.0.0.1', destPort: 3000 }), 'R 8080 ← 127.0.0.1:3000')
})

test('rejects bad tunnel drafts', () => {
  assert.throws(() => parseTunnelDraft({ kind: 'local', listenPort: 0, destPort: 80 }))
  assert.throws(() => parseTunnelDraft({ kind: 'nope', listenPort: 22, destPort: 22 }))
  assert.equal(parseTunnelDrafts([{ kind: 'socks', listenPort: 1080 }, { kind: 'local' }]).length, 1)
})

test('only localhost http URLs can be opened', () => {
  assert.equal(parseLocalHttpUrl('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000/')
  assert.match(parseLocalHttpUrl('http://localhost:9090'), /^http:\/\/localhost:9090\/?$/)
  assert.throws(() => parseLocalHttpUrl('http://203.0.113.10:3000/'), /localhost/)
  assert.throws(() => parseLocalHttpUrl('file:///etc/passwd'), /http/)
  assert.throws(() => parseLocalHttpUrl('http://user:pass@127.0.0.1:3000/'), /credentials/)
})
