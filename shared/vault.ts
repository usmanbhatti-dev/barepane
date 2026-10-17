import { STORAGE } from './storage.ts'

export const VAULT_KEY = STORAGE.vault
export const MIN_MASTER_PASSWORD = 8
export const PBKDF2_ITERATIONS = 210_000
const MAX_SECRET = 4096
const MAX_ENTRIES = 80

export type SessionSecrets = {
  password?: string
  passphrase?: string
  jumpPassword?: string
  jumpPassphrase?: string
}

export type VaultPayload = {
  secrets: Record<string, SessionSecrets>
}

export type VaultFile = {
  v: 1
  kdf: 'PBKDF2'
  hash: 'SHA-256'
  iter: number
  salt: string
  iv: string
  data: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function bytesToB64(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function parseSessionSecrets(raw: unknown): SessionSecrets | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const next: SessionSecrets = {}
  for (const key of ['password', 'passphrase', 'jumpPassword', 'jumpPassphrase'] as const) {
    const value = asString(item[key])
    if (!value || value.length > MAX_SECRET) continue
    next[key] = value
  }
  return Object.keys(next).length ? next : null
}

export function parseVaultPayload(raw: unknown): VaultPayload {
  if (!raw || typeof raw !== 'object') return { secrets: {} }
  const source = raw as Record<string, unknown>
  const map = source.secrets && typeof source.secrets === 'object' ? (source.secrets as Record<string, unknown>) : {}
  const secrets: Record<string, SessionSecrets> = {}
  for (const [id, value] of Object.entries(map)) {
    if (!id.trim() || secrets[id]) continue
    const parsed = parseSessionSecrets(value)
    if (!parsed) continue
    secrets[id] = parsed
    if (Object.keys(secrets).length >= MAX_ENTRIES) break
  }
  return { secrets }
}

export function parseVaultFile(raw: unknown): VaultFile {
  if (!raw || typeof raw !== 'object') throw new Error('Vault file is damaged.')
  const item = raw as Record<string, unknown>
  const salt = asString(item.salt)
  const iv = asString(item.iv)
  const data = asString(item.data)
  const iter = typeof item.iter === 'number' ? item.iter : Number(item.iter)
  if (item.v !== 1 || item.kdf !== 'PBKDF2' || item.hash !== 'SHA-256') {
    throw new Error('Vault file is damaged.')
  }
  if (!Number.isInteger(iter) || iter < 100_000 || iter > 1_000_000) {
    throw new Error('Vault file is damaged.')
  }
  if (!salt || !iv || !data) throw new Error('Vault file is damaged.')
  try {
    b64ToBytes(salt)
    b64ToBytes(iv)
    b64ToBytes(data)
  } catch {
    throw new Error('Vault file is damaged.')
  }
  return { v: 1, kdf: 'PBKDF2', hash: 'SHA-256', iter, salt, iv, data }
}

export function secretsFromForm(form: {
  password: string
  passphrase: string
  jumpPassword: string
  jumpPassphrase: string
}): SessionSecrets | null {
  return parseSessionSecrets(form)
}

export function applySecrets<T extends {
  password: string
  passphrase: string
  jumpPassword: string
  jumpPassphrase: string
}>(form: T, secrets: SessionSecrets | null): T {
  if (!secrets) return form
  return {
    ...form,
    password: secrets.password || form.password,
    passphrase: secrets.passphrase || form.passphrase,
    jumpPassword: secrets.jumpPassword || form.jumpPassword,
    jumpPassphrase: secrets.jumpPassphrase || form.jumpPassphrase,
  }
}

function assertPassword(password: string): string {
  if (password.length < MIN_MASTER_PASSWORD) {
    throw new Error(`Master password must be at least ${MIN_MASTER_PASSWORD} characters.`)
  }
  return password
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptBytes(key: CryptoKey, payload: VaultPayload): Promise<{ iv: Uint8Array; data: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, encoded))
  return { iv, data }
}

async function decryptBytes(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<VaultPayload> {
  try {
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(data))
    return parseVaultPayload(JSON.parse(new TextDecoder().decode(raw)))
  } catch {
    throw new Error('Master password incorrect or vault is damaged.')
  }
}

export async function createVault(password: string, payload: VaultPayload = { secrets: {} }): Promise<{ file: VaultFile; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(assertPassword(password), salt, PBKDF2_ITERATIONS)
  const sealed = await encryptBytes(key, parseVaultPayload(payload))
  return {
    key,
    file: {
      v: 1,
      kdf: 'PBKDF2',
      hash: 'SHA-256',
      iter: PBKDF2_ITERATIONS,
      salt: bytesToB64(salt),
      iv: bytesToB64(sealed.iv),
      data: bytesToB64(sealed.data),
    },
  }
}

export async function openVault(file: VaultFile, password: string): Promise<{ payload: VaultPayload; key: CryptoKey }> {
  const parsed = parseVaultFile(file)
  const key = await deriveKey(password, b64ToBytes(parsed.salt), parsed.iter)
  const payload = await decryptBytes(key, b64ToBytes(parsed.iv), b64ToBytes(parsed.data))
  return { key, payload }
}

export async function sealVault(
  key: CryptoKey,
  meta: Pick<VaultFile, 'salt' | 'iter'>,
  payload: VaultPayload,
): Promise<VaultFile> {
  const sealed = await encryptBytes(key, parseVaultPayload(payload))
  return {
    v: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iter: meta.iter,
    salt: meta.salt,
    iv: bytesToB64(sealed.iv),
    data: bytesToB64(sealed.data),
  }
}
