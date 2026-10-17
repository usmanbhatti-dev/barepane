import assert from 'node:assert/strict'
import test from 'node:test'
import { STORAGE, bookmarksKey, migrateStorage, tunnelsKey } from './storage.ts'

function mockLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const storage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  return store
}

test('migrateStorage copies ubuntu-gui keys when barepane keys are missing', () => {
  const store = mockLocalStorage()
  store.set('ubuntu-gui.sessions', '[{"host":"a.example"}]')
  store.set('ubuntu-gui.bookmarks./home', '["/var/www"]')
  store.set('ubuntu-gui.tunnels.prod', '[]')
  migrateStorage()
  assert.equal(localStorage.getItem(STORAGE.sessions), '[{"host":"a.example"}]')
  assert.equal(localStorage.getItem(bookmarksKey('/home')), '["/var/www"]')
  assert.equal(localStorage.getItem(tunnelsKey('prod')), '[]')
})

test('migrateStorage does not overwrite existing barepane keys', () => {
  const store = mockLocalStorage()
  store.set('ubuntu-gui.sessions', 'old')
  store.set(STORAGE.sessions, 'new')
  migrateStorage()
  assert.equal(localStorage.getItem(STORAGE.sessions), 'new')
})
