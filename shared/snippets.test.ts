import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SNIPPETS, deleteSnippet, parseSnippet, parseSnippets, upsertSnippet } from './snippets.ts'

test('parses snippets and drops empty ones', () => {
  const parsed = parseSnippets([
    { id: 'a', name: ' Restart nginx ', command: ' sudo systemctl restart nginx ' },
    { name: '', command: 'ls' },
    { id: 'b', name: 'ok', command: '' },
    null,
  ])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]?.name, 'Restart nginx')
  assert.equal(parsed[0]?.command, 'sudo systemctl restart nginx')
})

test('upserts by id and deletes', () => {
  const first = parseSnippet({ id: '1', name: 'ls', command: 'ls' })
  assert.ok(first)
  let list = upsertSnippet([], first)
  list = upsertSnippet(list, { ...first, command: 'ls -la' })
  assert.equal(list.length, 1)
  assert.equal(list[0]?.command, 'ls -la')
  assert.equal(deleteSnippet(list, '1').length, 0)
})

test('ships default snippets', () => {
  assert.ok(DEFAULT_SNIPPETS.some((item) => item.command.includes('docker ps')))
  assert.ok(DEFAULT_SNIPPETS.every((item) => item.id && item.name && item.command))
})

test('keeps an empty list empty', () => {
  assert.deepEqual(parseSnippets([]), [])
})

test('drops overlong names and commands', () => {
  assert.equal(parseSnippet({ id: 'x', name: 'a'.repeat(49), command: 'ls' }), null)
  assert.equal(parseSnippet({ id: 'x', name: 'ok', command: 'c'.repeat(4001) }), null)
})
