import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { HOST_KEY_CHANGED, HOST_KEY_REJECTED, hostKeyId, parseKnownHosts, sameFingerprint, type KnownHost } from '../../shared/hosts'

export function fingerprintSha256(key: Buffer): string {
  const digest = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return `SHA256:${digest}`
}

function hostsFile(): string {
  return path.join(app.getPath('userData'), 'known-hosts.json')
}

function loadHosts(): Record<string, KnownHost> {
  const file = hostsFile()
  if (!existsSync(file)) return {}
  try {
    return parseKnownHosts(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return {}
  }
}

function saveHosts(hosts: Record<string, KnownHost>): void {
  const file = hostsFile()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(hosts, null, 2)}\n`, 'utf8')
}

function remember(host: string, port: number, fingerprint: string): void {
  const hosts = loadHosts()
  hosts[hostKeyId(host, port)] = { host, port, fingerprint, seenAt: Date.now() }
  saveHosts(hosts)
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export async function confirmHostKey(host: string, port: number, key: Buffer): Promise<string> {
  const fingerprint = fingerprintSha256(key)
  const saved = loadHosts()[hostKeyId(host, port)]
  const win = parentWindow()

  const ask = (options: Electron.MessageBoxOptions) =>
    win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)

  if (!saved) {
    const result = await ask({
      type: 'question',
      buttons: ['Trust and continue', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Unknown SSH host',
      message: `First connection to ${host}:${port}`,
      detail: `Fingerprint:\n${fingerprint}\n\nCompare this with your cloud console or a previous ssh session. Only continue if you trust this server.`,
    })
    if (result.response !== 0) throw new Error(HOST_KEY_REJECTED)
    remember(host, port, fingerprint)
    return fingerprint
  }

  if (sameFingerprint(saved.fingerprint, fingerprint)) return fingerprint

  const result = await ask({
    type: 'warning',
    buttons: ['Cancel', 'Replace key and continue'],
    defaultId: 0,
    cancelId: 0,
    title: 'SSH host key changed',
    message: `The key for ${host}:${port} does not match the one saved on this computer.`,
    detail: `Saved:\n${saved.fingerprint}\n\nThis server:\n${fingerprint}\n\nIf you rebuilt the VPS this can be normal. If you did not expect a new key, cancel.`,
  })
  if (result.response !== 1) throw new Error(HOST_KEY_CHANGED)
  remember(host, port, fingerprint)
  return fingerprint
}
