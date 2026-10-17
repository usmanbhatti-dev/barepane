import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSecurity } from './security.ts'

const SAMPLE = `
BEGIN_META
SSH_ROOT=yes
SSH_PASSWORD=yes
UFW=Status: inactive
FAIL2BAN=inactive
DOCKER_SOCK=srw-rw-rw-
WWW_ENV=yes
WWW_GIT=no
END_META
BEGIN_PUBLIC
0.0.0.0:22
0.0.0.0:80
0.0.0.0:3306
127.0.0.1:6379
END_PUBLIC
BEGIN_CERTS
app	Jan 1 00:00:00 2020 GMT
END_CERTS
`

test('flags root SSH, passwords, open DB port, and expired cert', () => {
  const snap = parseSecurity(SAMPLE, Date.parse('2026-01-01'))
  const ids = snap.findings.map((item) => item.id)
  assert.equal(ids.includes('ssh-root'), true)
  assert.equal(ids.includes('ssh-password'), true)
  assert.equal(ids.includes('ports'), true)
  assert.equal(snap.publicPorts.some((item) => item.port === 3306), true)
  assert.equal(snap.publicPorts.some((item) => item.port === 6379), false)
  assert.equal(snap.findings.some((item) => item.id.startsWith('cert-') && item.level === 'bad'), true)
  assert.equal(snap.findings.find((item) => item.id === 'www-env')?.level, 'warn')
  assert.equal(snap.findings.find((item) => item.id === 'docker-sock')?.level, 'bad')
})
