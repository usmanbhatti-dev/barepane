import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SERVERS_EXPORT_KIND,
  defaultSessionName,
  deleteSavedSession,
  mergeSavedSessions,
  parseSavedSession,
  parseSavedSessions,
  parseServersExport,
  serializeSavedSessions,
  sessionFingerprint,
  upsertSavedSession,
} from './sessions.ts'

test('parses saved sessions and drops secrets', () => {
  const parsed = parseSavedSessions([
    {
      id: 'a',
      name: 'Prod',
      host: 'vps.example.com',
      port: '22',
      username: 'ubuntu',
      privateKeyPath: '/home/me/.ssh/id_ed25519',
      password: 'nope',
      jump: { host: 'bastion', port: 22, username: 'jump', password: 'secret' },
    },
    { host: '', username: 'nobody' },
    null,
  ])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]?.name, 'Prod')
  assert.equal(parsed[0]?.privateKeyPath, '/home/me/.ssh/id_ed25519')
  assert.equal(parsed[0]?.jump?.host, 'bastion')
  assert.equal('password' in (parsed[0] || {}), false)
  assert.equal(parsed[0]?.jump && 'password' in parsed[0].jump, false)
})

test('upserts by id and moves to front', () => {
  const first = parseSavedSession({ id: '1', host: 'a.example', username: 'u', name: 'A' })
  const second = parseSavedSession({ id: '2', host: 'b.example', username: 'u', name: 'B' })
  assert.ok(first && second)
  let list = upsertSavedSession([], first)
  list = upsertSavedSession(list, second)
  list = upsertSavedSession(list, { ...first, name: 'A2' })
  assert.equal(list.map((item) => item.id).join(','), '1,2')
  assert.equal(list[0]?.name, 'A2')
})

test('deletes by id and names a session', () => {
  const session = parseSavedSession({ id: 'x', host: 'box', username: 'root' })
  assert.ok(session)
  assert.equal(defaultSessionName('root', 'box'), 'root@box')
  assert.equal(sessionFingerprint(session), 'root@box:22')
  assert.equal(deleteSavedSession([session], 'x').length, 0)
})

test('exports and merges servers without secrets', () => {
  const list = parseSavedSessions([
    { id: 'a', host: 'a.example', username: 'ubuntu', password: 'nope', forwardAgent: true },
  ])
  const json = JSON.parse(serializeSavedSessions(list)) as { kind: string; sessions: unknown[] }
  assert.equal(json.kind, SERVERS_EXPORT_KIND)
  assert.equal(json.sessions.length, 1)
  assert.equal('password' in (json.sessions[0] as object), false)
  const imported = parseServersExport(json)
  assert.equal(imported[0]?.forwardAgent, true)
  const extra = parseSavedSession({ id: 'b', host: 'b.example', username: 'ubuntu' })
  assert.ok(extra)
  const merged = mergeSavedSessions(imported, [
    extra,
    { id: 'new', name: 'A2', host: 'a.example', username: 'ubuntu', port: 22 },
  ])
  assert.equal(merged.length, 2)
  assert.equal(merged.find((item) => item.host === 'a.example')?.name, 'A2')
})

test('imports a legacy ubuntu-gui.servers export', () => {
  const imported = parseServersExport({
    v: 1,
    kind: 'ubuntu-gui.servers',
    sessions: [{ id: 'a', host: 'a.example', username: 'ubuntu' }],
  })
  assert.equal(imported.length, 1)
  assert.equal(imported[0]?.host, 'a.example')
})
