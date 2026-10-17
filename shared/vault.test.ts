import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MIN_MASTER_PASSWORD,
  applySecrets,
  createVault,
  openVault,
  parseSessionSecrets,
  parseVaultFile,
  sealVault,
  secretsFromForm,
} from './vault.ts'

test('round-trips vault secrets and rejects a wrong password', async () => {
  const created = await createVault('correct horse', { secrets: { a: { password: 's3cret', passphrase: 'key-lock' } } })
  const opened = await openVault(created.file, 'correct horse')
  assert.equal(opened.payload.secrets.a?.password, 's3cret')
  assert.equal(opened.payload.secrets.a?.passphrase, 'key-lock')
  await assert.rejects(() => openVault(created.file, 'wrong password'), /incorrect/i)
})

test('reseals with the in-memory key', async () => {
  const created = await createVault('abcdefgh', { secrets: {} })
  const next = await sealVault(created.key, created.file, { secrets: { b: { jumpPassword: 'j' } } })
  const opened = await openVault(next, 'abcdefgh')
  assert.equal(opened.payload.secrets.b?.jumpPassword, 'j')
})

test('parses secrets and vault files, drops junk', async () => {
  assert.deepEqual(parseSessionSecrets({ password: ' x ', passphrase: '', extra: 'nope' }), { password: ' x ' })
  assert.equal(parseSessionSecrets({ password: '' }), null)
  assert.equal(secretsFromForm({ password: '', passphrase: '', jumpPassword: '', jumpPassphrase: '' }), null)
  const form = applySecrets(
    { password: '', passphrase: '', jumpPassword: '', jumpPassphrase: '' },
    { password: 'p' },
  )
  assert.equal(form.password, 'p')
  assert.throws(() => parseVaultFile({ v: 2, kdf: 'PBKDF2', hash: 'SHA-256', iter: 210000, salt: 'YQ==', iv: 'YQ==', data: 'YQ==' }))
  await assert.rejects(() => createVault('short', { secrets: {} }), new RegExp(String(MIN_MASTER_PASSWORD)))
})
