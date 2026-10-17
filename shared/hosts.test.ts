import assert from 'node:assert/strict'
import test from 'node:test'
import { hostKeyId, parseKnownHosts, sameFingerprint } from './hosts.ts'

test('known host id is case-insensitive', () => {
  assert.equal(hostKeyId('EC2.example.com', 22), hostKeyId('ec2.example.com', 22))
})

test('parses saved fingerprints', () => {
  const parsed = parseKnownHosts({
    'box|22': { host: 'box', port: 22, fingerprint: 'SHA256:abc', seenAt: 1 },
    junk: { host: '', port: 22 },
  })
  assert.equal(parsed['box|22']?.fingerprint, 'SHA256:abc')
  assert.equal(parsed.junk, undefined)
})

test('compares fingerprints without case', () => {
  assert.equal(sameFingerprint('SHA256:AbC', 'sha256:abc'), true)
  assert.equal(sameFingerprint('SHA256:a', 'SHA256:b'), false)
})
