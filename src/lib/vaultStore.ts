import {
  VAULT_KEY,
  createVault,
  openVault,
  parseVaultFile,
  parseVaultPayload,
  sealVault,
  type SessionSecrets,
  type VaultFile,
  type VaultPayload,
} from '@shared/vault'
import { loadSavedSessions } from './savedSessions'

type Listener = () => void

let key: CryptoKey | null = null
let meta: Pick<VaultFile, 'salt' | 'iter'> | null = null
let payload: VaultPayload = { secrets: {} }
let version = 0
const listeners = new Set<Listener>()

function notify(): void {
  version += 1
  for (const listener of listeners) listener()
}

function readFile(): VaultFile | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY)
    return raw ? parseVaultFile(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeFile(file: VaultFile): void {
  localStorage.setItem(VAULT_KEY, JSON.stringify(file))
}

function prune(next: VaultPayload): VaultPayload {
  const ids = new Set(loadSavedSessions().map((item) => item.id))
  const secrets: Record<string, SessionSecrets> = {}
  for (const [id, value] of Object.entries(next.secrets)) {
    if (ids.has(id)) secrets[id] = value
  }
  return { secrets }
}

export function subscribeVault(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getVaultVersion(): number {
  return version
}

export function hasVault(): boolean {
  return Boolean(readFile() || key)
}

export function isVaultUnlocked(): boolean {
  return Boolean(key)
}

export function vaultSecretsFor(sessionId: string): SessionSecrets | null {
  if (!key) return null
  return payload.secrets[sessionId] || null
}

export function lockVault(): void {
  key = null
  meta = null
  payload = { secrets: {} }
  notify()
}

export async function createMasterPassword(password: string): Promise<void> {
  if (readFile()) throw new Error('A vault already exists. Unlock it instead.')
  const created = await createVault(password, { secrets: {} })
  writeFile(created.file)
  key = created.key
  meta = { salt: created.file.salt, iter: created.file.iter }
  payload = { secrets: {} }
  notify()
}

export async function unlockVault(password: string): Promise<void> {
  const file = readFile()
  if (!file) throw new Error('No password vault yet.')
  const opened = await openVault(file, password)
  key = opened.key
  meta = { salt: file.salt, iter: file.iter }
  payload = prune(opened.payload)
  if (Object.keys(payload.secrets).length !== Object.keys(opened.payload.secrets).length) {
    writeFile(await sealVault(key, meta, payload))
  }
  notify()
}

export async function putVaultSecrets(sessionId: string, secrets: SessionSecrets | null): Promise<void> {
  if (!key || !meta) throw new Error('Unlock the vault to save passwords.')
  const next = parseVaultPayload(payload)
  if (secrets) next.secrets[sessionId] = secrets
  else delete next.secrets[sessionId]
  payload = next
  writeFile(await sealVault(key, meta, payload))
  notify()
}

export async function removeVaultSecrets(sessionId: string): Promise<void> {
  if (!key || !payload.secrets[sessionId]) return
  await putVaultSecrets(sessionId, null)
}

export async function changeMasterPassword(current: string, nextPassword: string): Promise<void> {
  const file = readFile()
  if (!file) throw new Error('No password vault yet.')
  const opened = await openVault(file, current)
  const created = await createVault(nextPassword, prune(opened.payload))
  writeFile(created.file)
  key = created.key
  meta = { salt: created.file.salt, iter: created.file.iter }
  payload = prune(opened.payload)
  notify()
}

export function forgetVault(): void {
  localStorage.removeItem(VAULT_KEY)
  lockVault()
}
