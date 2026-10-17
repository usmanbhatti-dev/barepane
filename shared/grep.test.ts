import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGrepCommand, parseGrepHits, parseGrepQuery } from './grep.ts'

test('rejects empty or unsafe grep queries', () => {
  assert.throws(() => parseGrepQuery('  '), /Enter text/)
  assert.throws(() => parseGrepQuery('a\nb'), /line breaks/)
})

test('builds a fixed-string find+grep command', () => {
  const command = buildGrepCommand('/var/www', 'listen 80')
  assert.match(command, /find '\/var\/www'/)
  assert.match(command, /-e 'listen 80'/)
  assert.match(command, /grep -nIF/)
  assert.doesNotMatch(command, /;/)
})

test('parses grep hits', () => {
  const hits = parseGrepHits('/etc/nginx/nginx.conf:12:    worker_processes auto;\nnot-a-hit\n/etc/hosts:1:127.0.0.1 localhost\n')
  assert.equal(hits.length, 2)
  assert.equal(hits[0]?.path, '/etc/nginx/nginx.conf')
  assert.equal(hits[0]?.line, 12)
  assert.match(hits[0]?.text ?? '', /worker_processes/)
})
