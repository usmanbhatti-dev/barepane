import assert from 'node:assert/strict'
import test from 'node:test'
import { formatSshError, isExpectedDisconnect, isSudoPasswordIncorrect, isSudoPasswordRequired } from './errors.ts'

test('maps common SSH failures', () => {
  assert.match(formatSshError(new Error('All configured authentication methods failed')), /Login failed/)
  assert.match(formatSshError(new Error('connect ETIMEDOUT')), /timed out/i)
  assert.match(formatSshError(new Error('connect ECONNREFUSED')), /refused/i)
  assert.match(
    formatSshError(new Error("Error invoking remote method 'ssh:connect': Error: Encrypted private OpenSSH key detected, but no passphrase given")),
    /key passphrase/i,
  )
  assert.match(formatSshError(new Error('The SSH host key was not trusted. Connection cancelled.')), /host key/i)
})

test('sudo helpers', () => {
  assert.equal(isSudoPasswordRequired(new Error('Sudo password required.')), true)
  assert.equal(isSudoPasswordIncorrect(new Error('Sudo password incorrect.')), true)
  assert.equal(isSudoPasswordRequired(new Error('This user cannot use sudo.')), false)
  assert.equal(isExpectedDisconnect(new Error('This SSH session is no longer connected.')), true)
  assert.equal(isExpectedDisconnect(new Error('Sudo password required.')), false)
})
