import assert from 'node:assert/strict'
import test from 'node:test'
import { parseProxyJump, parseSshConfig } from './sshConfig.ts'

test('parses Host blocks and skips wildcards', () => {
  const hosts = parseSshConfig(
    `
Host *
  User nobody

Host prod staging
  HostName 203.0.113.10
  User ubuntu
  Port 2222
  IdentityFile ~/.ssh/id_ed25519
  ForwardAgent yes

Host jumpbox
  HostName bastion.example
  User jump
`,
    { defaultUser: 'local' },
  )
  assert.equal(hosts.length, 2)
  assert.equal(hosts[0]?.alias, 'prod')
  assert.equal(hosts[0]?.host, '203.0.113.10')
  assert.equal(hosts[0]?.username, 'ubuntu')
  assert.equal(hosts[0]?.port, 2222)
  assert.equal(hosts[0]?.privateKeyPath, '~/.ssh/id_ed25519')
  assert.equal(hosts[0]?.forwardAgent, true)
  assert.equal(hosts[1]?.alias, 'jumpbox')
  assert.equal(hosts[1]?.username, 'jump')
})

test('uses default user when User is missing', () => {
  const hosts = parseSshConfig('Host web\n  HostName 10.0.0.2\n', { defaultUser: 'deploy' })
  assert.equal(hosts[0]?.username, 'deploy')
  assert.equal(hosts[0]?.host, '10.0.0.2')
})

test('parses ProxyJump user@host:port', () => {
  const jump = parseProxyJump('jump@bastion:2200')
  assert.deepEqual(jump, { host: 'bastion', port: 2200, username: 'jump', useAgent: true })
  const hosts = parseSshConfig(
    'Host app\n  HostName 10.1.2.3\n  User www\n  ProxyJump jump@bastion:2200\n',
  )
  assert.equal(hosts[0]?.jump?.host, 'bastion')
  assert.equal(hosts[0]?.jump?.username, 'jump')
})

test('skips hosts without a user', () => {
  assert.equal(parseSshConfig('Host naked\n  HostName 1.2.3.4\n').length, 0)
})
