export const STORAGE = {
  sessions: 'barepane.sessions',
  lastConnection: 'barepane.last-connection',
  snippets: 'barepane.snippets',
  vault: 'barepane.vault',
  rememberSecrets: 'barepane.remember-secrets',
  split: 'barepane.split',
  editorSplit: 'barepane.editor-split',
  termSplit: 'barepane.term-split',
  layout: 'barepane.layout',
  hidden: 'barepane.hidden',
  helpSeen: 'barepane.help-seen',
} as const

export function bookmarksKey(scope: string): string {
  return `barepane.bookmarks.${scope}`
}

export function tunnelsKey(scope: string): string {
  return `barepane.tunnels.${scope}`
}

function copyIfMissing(next: string, prev: string): void {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(next) != null) return
  const old = localStorage.getItem(prev)
  if (old != null) localStorage.setItem(next, old)
}

/** Copy Ubuntu GUI localStorage keys so saved servers, vault, and layout survive the rename. */
export function migrateStorage(): void {
  if (typeof localStorage === 'undefined') return
  for (const next of Object.values(STORAGE)) {
    copyIfMissing(next, next.replace(/^barepane\./, 'ubuntu-gui.'))
  }
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key) keys.push(key)
  }
  for (const key of keys) {
    if (key.startsWith('ubuntu-gui.bookmarks.') || key.startsWith('ubuntu-gui.tunnels.')) {
      copyIfMissing(key.replace(/^ubuntu-gui\./, 'barepane.'), key)
    }
  }
}
