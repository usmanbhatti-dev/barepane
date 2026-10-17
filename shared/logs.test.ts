import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLogCommand, logLabel, parseLogDraft } from './logs.ts'

test('parses journal and file drafts', () => {
  assert.deepEqual(parseLogDraft({ kind: 'journal', unit: ' nginx.service ', priority: 'err', lines: '100' }), {
    kind: 'journal',
    scope: 'system',
    unit: 'nginx.service',
    priority: 'err',
    lines: 100,
    sudo: false,
  })
  assert.equal(parseLogDraft({ kind: 'file', path: '/var/log/syslog' }).path, '/var/log/syslog')
  assert.equal(logLabel({ kind: 'file', path: '/var/log/nginx/error.log' }), 'error.log')
  assert.equal(logLabel({ kind: 'journal', unit: 'ssh.service' }), 'ssh.service')
})

test('rejects unsafe log drafts', () => {
  assert.throws(() => parseLogDraft({ kind: 'journal', unit: 'nginx; rm -rf /' }))
  assert.throws(() => parseLogDraft({ kind: 'journal', unit: "nginx.service' -u other" }))
  assert.throws(() => parseLogDraft({ kind: 'file', path: 'var/log/syslog' }))
  assert.throws(() => parseLogDraft({ kind: 'file', path: '/var/log/sys\nlog' }))
  assert.throws(() => parseLogDraft({ kind: 'journal', priority: 'nope' }))
  assert.throws(() => parseLogDraft({ kind: 'docker', container: 'web; rm' }))
})

test('builds quoted follow commands', () => {
  const journal = buildLogCommand({ kind: 'journal', unit: 'nginx.service', lines: 50 })
  assert.equal(journal, `journalctl --no-pager --output=short-iso -n 50 -f -u 'nginx.service'`)
  assert.ok(buildLogCommand({ kind: 'journal', scope: 'user' }).includes(' --user'))
  const file = buildLogCommand({ kind: 'file', path: `/tmp/a'b.log` })
  assert.match(file, /^tail -n 200 -F -- /)
  assert.equal(logLabel({ kind: 'docker', container: 'nginx' }), 'nginx')
  assert.ok(buildLogCommand({ kind: 'docker', container: 'web_1', lines: 80 }).includes(`docker logs -f --tail 80`))
})
