import assert from 'node:assert/strict'
import test from 'node:test'
import { joinPath, normalizePath, parentDir, parseConnectionTarget, pathSegments, shellQuote, validateName } from './paths.ts'

test('normalizePath collapses slashes and dots', () => {
  assert.equal(normalizePath('/etc//nginx/./sites-available'), '/etc/nginx/sites-available')
  assert.equal(normalizePath('/var/www/../log'), '/var/log')
  assert.equal(normalizePath('/'), '/')
})

test('joinPath and parentDir', () => {
  assert.equal(joinPath('/', 'etc'), '/etc')
  assert.equal(joinPath('/etc/nginx', 'nginx.conf'), '/etc/nginx/nginx.conf')
  assert.equal(parentDir('/etc/nginx/nginx.conf'), '/etc/nginx')
  assert.equal(parentDir('/'), '/')
})

test('pathSegments', () => {
  assert.deepEqual(pathSegments('/etc/nginx'), ['etc', 'nginx'])
  assert.deepEqual(pathSegments('/'), [])
})

test('shellQuote escapes single quotes', () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`)
})

test('validateName', () => {
  assert.equal(validateName('  notes.txt  '), 'notes.txt')
  assert.throws(() => validateName('..'))
  assert.throws(() => validateName('a/b'))
})

test('parseConnectionTarget', () => {
  assert.deepEqual(parseConnectionTarget('ubuntu@192.168.1.10'), { username: 'ubuntu', host: '192.168.1.10' })
  assert.deepEqual(parseConnectionTarget('vps.example.com'), { host: 'vps.example.com' })
})
