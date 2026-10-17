import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, stat as fsStat } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { posix } from 'node:path'
import type { Duplex } from 'node:stream'
import type { Client, ClientChannel, SFTPWrapper } from 'ssh2'
import { formatSshError } from '../../shared/errors'
import { MAX_EDIT_BYTES } from '../../shared/limits'
import { normalizePath, shellQuote } from '../../shared/paths'
import { parseLogDraft, buildLogCommand, logLabel, MAX_LOG_STREAMS } from '../../shared/logs'
import {
  buildContainerCommand,
  buildContainerListCommand,
  buildUnitCommand,
  buildUnitListCommand,
  looksDockerDaemonDown,
  looksMissingDocker,
  looksServicePermission,
  parseContainerAction,
  parseContainerName,
  parseDockerPs,
  parseServiceAction,
  parseSystemctlList,
  parseUnitName,
} from '../../shared/services'
import { parseHealth, HEALTH_SCRIPT, STATS_SCRIPT } from '../../shared/health'
import {
  buildComposeCommand,
  buildPm2Command,
  parseComposeAction,
  parseComposeName,
  parsePm2Action,
  parsePm2Name,
  parseRuntime,
  RUNTIME_SCRIPT,
} from '../../shared/runtime'
import { parseSecurity, SECURITY_SCRIPT } from '../../shared/security'
import { buildGrepCommand, parseGrepHits } from '../../shared/grep'
import { HOST_KEY_REJECTED } from '../../shared/hosts'
import { buildSiteCommand, parseSiteAction } from '../../shared/sites'
import { parseTunnelDraft } from '../../shared/tunnels'
import type {
  ConnectPayload,
  ConnectResult,
  ContainerAction,
  ContainerList,
  ContentHit,
  FileStat,
  LogDraft,
  LogStreamInfo,
  RemoteFile,
  SearchOptions,
  ServerStats,
  ServiceAction,
  ServiceUnit,
  ComposeAction,
  Pm2Action,
  RuntimeSnapshot,
  SecuritySnapshot,
  SiteAction,
  SshAuth,
  TransferProgress,
  TunnelDraft,
  TunnelInfo,
} from '../../shared/types'
import { confirmHostKey } from './hosts'
import { handleSocksConnection } from './socks'

const require = createRequire(import.meta.url)
const { Client: SSHClient } = require('ssh2') as typeof import('ssh2')

type DataListener = (shellId: string, data: string) => void
type LogDataListener = (logId: string, data: string) => void
type LogCloseListener = (logId: string, reason: string) => void
type CloseListener = (reason: string) => void

type ShellState = {
  channel: ClientChannel
  ready: boolean
  pending: string[]
  pendingOut: string
  flushTimer: ReturnType<typeof setImmediate> | null
}

type LiveTunnel = {
  info: TunnelInfo
  stop: () => Promise<void>
}

type LiveLog = {
  info: LogStreamInfo
  channel: ClientChannel
}

type LiveConnection = {
  home: string
  username: string
  host: string
  port: number
  forwardAgent?: boolean
  hostFingerprint?: string
}

type TransferListener = (transfer: TransferProgress) => void

type ResolvedAuth = {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: Buffer
  passphrase?: string
  agent?: string
  forwardAgent?: boolean
}

function sshAgentPath(): string | undefined {
  if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK
  if (process.platform === 'win32') return 'pageant'
  return undefined
}

export function hasSshAgent(): boolean {
  return Boolean(sshAgentPath())
}

function resolveAuth(payload: SshAuth, label: string): ResolvedAuth {
  const host = payload.host.trim()
  const username = payload.username.trim()
  const password = payload.password?.trim() || undefined
  const passphrase = payload.passphrase?.trim() || undefined
  const keyPath = payload.privateKeyPath?.trim() || undefined
  const agent = sshAgentPath()
  const useAgent = payload.useAgent !== false && Boolean(agent)
  const forwardAgent = payload.forwardAgent === true && Boolean(agent)
  if (!host || !username) {
    throw new Error(`${label}: IP/host and user are required.`)
  }
  if (!password && !keyPath && !useAgent) {
    throw new Error(`${label}: provide a password, an SSH key, or enable the SSH agent.`)
  }
  if (!Number.isInteger(payload.port) || payload.port < 1 || payload.port > 65535) {
    throw new Error(`${label}: port must be a number between 1 and 65535.`)
  }

  let privateKey: Buffer | undefined
  if (keyPath) {
    try {
      privateKey = readFileSync(keyPath)
    } catch {
      throw new Error(`${label}: could not read the SSH key file.`)
    }
    const locked = isEncryptedKey(privateKey) && !passphrase
    if (locked && (useAgent || password)) {
      privateKey = undefined
    } else if (locked) {
      throw new Error(
        `${label}: this SSH key is locked. Type the key passphrase — that is not your server password. If you already unlocked this key in Terminal (ssh-add), keep Use ssh-agent checked and clear the key field.`,
      )
    }
  }

  return {
    host,
    port: payload.port,
    username,
    password,
    privateKey,
    passphrase,
    agent: useAgent ? agent : undefined,
    forwardAgent,
  }
}

function openSshClient(auth: ResolvedAuth, sock?: Duplex): Promise<{ client: Client; fingerprint: string }> {
  const client: Client = new SSHClient()
  return new Promise((resolve, reject) => {
    let fingerprint = ''
    let hostError: Error | null = null
    const fail = (error: Error) => {
      try {
        client.end()
      } catch {
        // ignore
      }
      reject(hostError ?? new Error(formatSshError(error)))
    }
    client.once('ready', () => {
      client.setNoDelay(true)
      resolve({ client, fingerprint })
    })
    client.once('error', (error) => fail(error instanceof Error ? error : new Error(String(error))))
    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => auth.password || auth.passphrase || ''))
    })
    client.connect({
      host: auth.host,
      port: auth.port,
      username: auth.username,
      password: auth.password,
      privateKey: auth.privateKey,
      passphrase: auth.passphrase,
      agent: auth.agent,
      agentForward: Boolean(auth.forwardAgent && auth.agent),
      sock,
      readyTimeout: 20000,
      tryKeyboard: Boolean(auth.password),
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
        const blob = Buffer.isBuffer(key) ? key : Buffer.from(String(key), 'hex')
        void confirmHostKey(auth.host, auth.port, blob)
          .then((next) => {
            fingerprint = next
            verify(true)
          })
          .catch((error) => {
            hostError = error instanceof Error ? error : new Error(HOST_KEY_REJECTED)
            verify(false)
          })
      },
    })
  })
}

function openJumpStream(jump: Client, host: string, port: number): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    jump.forwardOut('127.0.0.1', 0, host, port, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error('Could not open a tunnel through the jump host.'))
        return
      }
      resolve(stream)
    })
  })
}

function endQuiet(client: Client | null | undefined): void {
  if (!client) return
  try {
    client.end()
  } catch {
    // ignore
  }
}

function isEncryptedKey(contents: Buffer): boolean {
  const text = contents.toString('utf8')
  if (/ENCRYPTED/i.test(text) || /Proc-Type:\s*4,\s*ENCRYPTED/i.test(text)) return true
  const block = text.match(/-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]*?)-----END OPENSSH PRIVATE KEY-----/)
  if (!block) return false
  try {
    const raw = Buffer.from(block[1].replace(/\s/g, ''), 'base64')
    const magic = Buffer.from('openssh-key-v1\0')
    if (raw.length < magic.length + 8 || !raw.subarray(0, magic.length).equals(magic)) {
      return /aes256|bcrypt/i.test(text)
    }
    const cipherLen = raw.readUInt32BE(magic.length)
    const cipher = raw.subarray(magic.length + 4, magic.length + 4 + cipherLen).toString('utf8')
    return cipher !== 'none'
  } catch {
    return /aes256|bcrypt/i.test(text)
  }
}

function isDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
  return lower.includes('permission denied') || lower.includes('eacces') || code === '3' || code === 'EACCES'
}

function looksFatalLogStart(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('sorry, try again') ||
    lower.includes('incorrect password') ||
    lower.includes('a password is required') ||
    lower.includes('not in the sudoers') ||
    lower.includes('not allowed to execute') ||
    lower.includes('permission denied') ||
    lower.includes('cannot open') ||
    lower.includes('no such file') ||
    lower.includes('failed to open') ||
    lower.includes('unit not found') ||
    lower.includes('invalid option')
  )
}

function logFollowError(code: number | null, text: string, hadPassword: boolean, usedSudo: boolean): Error {
  const lower = text.toLowerCase()
  if (lower.includes('not in the sudoers') || lower.includes('not allowed to execute')) {
    return new Error('This user cannot use sudo.')
  }
  if (lower.includes('incorrect password') || lower.includes('sorry, try again')) {
    return new Error('Sudo password incorrect.')
  }
  if (lower.includes('no such file')) {
    return new Error('That path does not exist.')
  }
  if (lower.includes('unit not found')) {
    return new Error(text.replace(/\s+/g, ' ').trim().slice(0, 220) || 'Unit not found.')
  }
  if (
    usedSudo &&
    !hadPassword &&
    (code !== 0 ||
      lower.includes('a password is required') ||
      lower.includes('permission denied') ||
      lower.includes('a terminal is required'))
  ) {
    return new Error('Sudo password required.')
  }
  if (lower.includes('permission denied') || lower.includes('cannot open') || lower.includes('failed to open')) {
    return new Error('Sudo password required.')
  }
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 220)
  return new Error(snippet || `Could not follow this log${code ? ` (${code})` : ''}.`)
}

function logFollowClose(code: number | null, text: string): string {
  if (!code) return 'stopped'
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 220)
  return snippet || `Log follow ended (${code})`
}

function modeString(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0')
}

export class SshSession {
  private client: Client | null = null
  private jumpClient: Client | null = null
  private sftp: SFTPWrapper | null = null
  private shells = new Map<string, ShellState>()
  private tunnels = new Map<string, LiveTunnel>()
  private logs = new Map<string, LiveLog>()
  private dataListener: DataListener | null = null
  private logDataListener: LogDataListener | null = null
  private logCloseListener: LogCloseListener | null = null
  private closeListener: CloseListener | null = null
  private transferListener: TransferListener | null = null
  private connection: LiveConnection | null = null
  private ignoreClose = false
  private remoteForwards = new Map<number, { destHost: string; destPort: number }>()
  private dirInflight = new Map<string, Promise<RemoteFile[]>>()
  private statsInflight: Promise<ServerStats> | null = null
  private healthInflight: Promise<ServerStats> | null = null
  private runtimeInflight: Promise<RuntimeSnapshot> | null = null
  private securityInflight: Promise<SecuritySnapshot> | null = null
  private cancelledTransfers = new Set<string>()

  onData(listener: DataListener): void {
    this.dataListener = listener
  }

  onLogData(listener: LogDataListener): void {
    this.logDataListener = listener
  }

  onLogClosed(listener: LogCloseListener): void {
    this.logCloseListener = listener
  }

  onClose(listener: CloseListener): void {
    this.closeListener = listener
  }

  onTransfer(listener: TransferListener): void {
    this.transferListener = listener
  }

  private emitTransfer(transfer: TransferProgress): void {
    this.transferListener?.(transfer)
  }

  cancelTransfer(id: string): void {
    this.cancelledTransfers.add(id)
  }

  private assertTransferActive(id: string): void {
    if (this.cancelledTransfers.has(id)) throw new Error('Transfer cancelled.')
  }

  isConnected(): boolean {
    return Boolean(this.client && this.sftp)
  }

  getConnection(): LiveConnection | null {
    return this.connection
  }

  async connect(payload: ConnectPayload): Promise<LiveConnection> {
    await this.disconnect()

    const destAuth = resolveAuth(payload, 'Server')
    const jumpAuth = payload.jump?.host?.trim() ? resolveAuth(payload.jump, 'Jump host') : null
    let jump: Client | null = null
    let client: Client | null = null

    try {
      let fingerprint = ''
      if (jumpAuth) {
        const openedJump = await openSshClient(jumpAuth)
        jump = openedJump.client
        const stream = await openJumpStream(jump, destAuth.host, destAuth.port)
        const opened = await openSshClient(destAuth, stream)
        client = opened.client
        fingerprint = opened.fingerprint
      } else {
        const opened = await openSshClient(destAuth)
        client = opened.client
        fingerprint = opened.fingerprint
      }
      if (!client) throw new Error('Could not open SSH')
      const dest = client

      const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
        dest.sftp((error, nextSftp) => {
          if (error || !nextSftp) {
            reject(error ?? new Error('Could not open SFTP'))
            return
          }
          resolve(nextSftp)
        })
      })

      this.client = dest
      this.jumpClient = jump
      this.sftp = sftp
      this.shells.clear()
      this.ignoreClose = false

      dest.on('tcp connection', (details, accept, reject) => {
        const forward = this.remoteForwards.get(details.destPort)
        if (!forward) {
          reject()
          return
        }
        const local = net.connect(forward.destPort, forward.destHost, () => {
          const stream = accept()
          local.pipe(stream)
          stream.pipe(local)
        })
        local.on('error', () => reject())
      })
      dest.on('close', () => {
        if (this.client === dest && !this.ignoreClose) this.closeListener?.('Connection closed')
      })
      dest.on('end', () => {
        if (this.client === dest && !this.ignoreClose) this.closeListener?.('Connection ended')
      })

      const home = await this.realpath('.')
      this.connection = {
        home,
        username: destAuth.username,
        host: destAuth.host,
        port: destAuth.port,
        forwardAgent: destAuth.forwardAgent,
        hostFingerprint: fingerprint,
      }
      return this.connection
    } catch (error) {
      endQuiet(client)
      endQuiet(jump)
      throw error instanceof Error ? error : new Error(formatSshError(error))
    }
  }

  async openShell(): Promise<string> {
    const client = this.client
    if (!client) throw new Error('Not connected')
    if (this.shells.size >= 12) throw new Error('Too many terminals on this server.')
    const shell = await new Promise<ClientChannel>((resolve, reject) => {
      client.shell({ term: 'xterm-256color', cols: 120, rows: 32 }, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error('Could not open shell'))
          return
        }
        resolve(stream)
      })
    })
    const id = randomUUID()
    const state: ShellState = { channel: shell, ready: false, pending: [], pendingOut: '', flushTimer: null }
    this.shells.set(id, state)
    shell.on('data', (chunk: Buffer) => this.pushOutput(id, chunk.toString('utf8')))
    shell.stderr?.on('data', (chunk: Buffer) => this.pushOutput(id, chunk.toString('utf8')))
    shell.on('close', () => {
      this.shells.delete(id)
    })
    return id
  }

  async closeShell(shellId: string): Promise<void> {
    const shell = this.shells.get(shellId)
    if (!shell) return
    this.shells.delete(shellId)
    if (shell.flushTimer) clearImmediate(shell.flushTimer)
    try {
      shell.channel.close()
    } catch {
      // ignore
    }
  }

  listShells(): string[] {
    return [...this.shells.keys()]
  }

  markTerminalReady(shellId: string): void {
    const shell = this.shells.get(shellId)
    if (!shell) return
    shell.ready = true
    const queued = shell.pending
    shell.pending = []
    for (const chunk of queued) this.dataListener?.(shellId, chunk)
  }

  writeTerminal(shellId: string, data: string): void {
    this.shells.get(shellId)?.channel.write(data)
  }

  writeAllTerminals(data: string): void {
    for (const shell of this.shells.values()) shell.channel.write(data)
  }

  resizeTerminal(shellId: string, cols: number, rows: number): void {
    this.shells.get(shellId)?.channel.setWindow(rows, cols, rows * 16, cols * 8)
  }

  listTunnels(): TunnelInfo[] {
    return [...this.tunnels.values()].map((item) => item.info)
  }

  async openTunnel(raw: TunnelDraft): Promise<TunnelInfo> {
    const client = this.client
    if (!client) throw new Error('Not connected')
    if (this.tunnels.size >= 16) throw new Error('Too many tunnels on this server.')
    const draft = parseTunnelDraft(raw)
    const id = randomUUID()
    if (draft.kind === 'local') return this.openLocalTunnel(id, client, draft)
    if (draft.kind === 'remote') return this.openRemoteTunnel(id, client, draft)
    return this.openSocksTunnel(id, client, draft)
  }

  async closeTunnel(tunnelId: string): Promise<void> {
    const tunnel = this.tunnels.get(tunnelId)
    if (!tunnel) return
    this.tunnels.delete(tunnelId)
    await tunnel.stop()
  }

  listLogs(): LogStreamInfo[] {
    return [...this.logs.values()].map((item) => item.info)
  }

  async openLog(raw: LogDraft, sudoPassword?: string): Promise<LogStreamInfo> {
    const client = this.client
    if (!client) throw new Error('Not connected')
    if (this.logs.size >= MAX_LOG_STREAMS) throw new Error('Too many log follows on this server.')
    const draft = parseLogDraft(raw)
    const inner = buildLogCommand(draft)
    const useSudo = Boolean(draft.sudo || sudoPassword)
    const command = useSudo
      ? sudoPassword
        ? `sudo -S -p '' -- bash -lc ${shellQuote(inner)}`
        : `sudo -n -- bash -lc ${shellQuote(inner)}`
      : inner
    const stream = await this.execStream(command)
    const id = randomUUID()
    const info: LogStreamInfo = {
      id,
      kind: draft.kind,
      label: logLabel(draft),
      scope: draft.scope,
      unit: draft.unit,
      priority: draft.priority,
      path: draft.path,
      container: draft.container,
      sudo: useSudo,
    }

    return new Promise((resolve, reject) => {
      let settled = false
      let attached = false
      const early: string[] = []

      const push = (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        if (!text) return
        if (!attached) {
          early.push(text)
          return
        }
        this.logDataListener?.(id, text)
      }

      const attach = () => {
        if (settled) return
        settled = true
        attached = true
        this.logs.set(id, { info, channel: stream })
        const prefix = early.join('')
        if (prefix) this.logDataListener?.(id, prefix)
        resolve(info)
      }

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        try {
          stream.close()
        } catch {
          // ignore
        }
        reject(error)
      }

      const timer = setTimeout(() => {
        if (looksFatalLogStart(early.join(''))) {
          fail(logFollowError(1, early.join(''), Boolean(sudoPassword), useSudo))
          return
        }
        attach()
      }, 900)
      stream.on('data', (chunk: Buffer) => {
        push(chunk)
        if (!settled && early.join('').trim() && !looksFatalLogStart(early.join(''))) {
          clearTimeout(timer)
          attach()
        }
      })
      stream.stderr?.on('data', (chunk: Buffer) => {
        push(chunk)
        if (!settled && early.join('').trim() && !looksFatalLogStart(early.join(''))) {
          clearTimeout(timer)
          attach()
        }
      })
      if (sudoPassword) stream.write(`${sudoPassword}\n`)
      stream.end()
      stream.on('close', (code: number | null) => {
        const text = early.join('')
        if (!attached) {
          clearTimeout(timer)
          fail(logFollowError(code, text, Boolean(sudoPassword), useSudo))
          return
        }
        const known = this.logs.delete(id)
        this.logCloseListener?.(id, known ? logFollowClose(code, text) : 'stopped')
      })
      stream.on('error', (error: Error) => {
        if (!attached) {
          clearTimeout(timer)
          fail(error)
          return
        }
        this.logs.delete(id)
        this.logCloseListener?.(id, error.message)
      })
    })
  }

  async closeLog(logId: string): Promise<void> {
    const log = this.logs.get(logId)
    if (!log) return
    this.logs.delete(logId)
    try {
      log.channel.close()
    } catch {
      // ignore
    }
  }

  async listUnits(sudoPassword?: string): Promise<ServiceUnit[]> {
    const { code, text } = await this.execMaybeSudo(buildUnitListCommand(), sudoPassword)
    if (looksServicePermission(text)) throw new Error('Sudo password required.')
    if (code && code !== 0 && !parseSystemctlList(text).length) {
      throw new Error(text.replace(/\s+/g, ' ').trim().slice(0, 220) || `Could not list services (${code}).`)
    }
    return parseSystemctlList(text)
  }

  async controlUnit(unit: string, action: ServiceAction, sudoPassword?: string): Promise<void> {
    const command = buildUnitCommand(parseServiceAction(action), parseUnitName(unit))
    const { code, text } = await this.execMaybeSudo(command, sudoPassword)
    if (looksServicePermission(text) || (code && code !== 0 && looksServicePermission(text))) {
      throw new Error('Sudo password required.')
    }
    if (code && code !== 0) {
      throw new Error(text.replace(/\s+/g, ' ').trim().slice(0, 220) || `systemctl ${action} failed.`)
    }
  }

  async listContainers(sudoPassword?: string): Promise<ContainerList> {
    const { code, text } = await this.execMaybeSudo(buildContainerListCommand(), sudoPassword)
    if (looksMissingDocker(text)) return { items: [], missing: true }
    if (looksDockerDaemonDown(text)) return { items: [], daemon: true }
    if (looksServicePermission(text)) throw new Error('Sudo password required.')
    if (code && code !== 0) {
      return { items: [], error: text.replace(/\s+/g, ' ').trim().slice(0, 220) || `docker ps failed (${code}).` }
    }
    return { items: parseDockerPs(text) }
  }

  async controlContainer(name: string, action: ContainerAction, sudoPassword?: string): Promise<void> {
    const command = buildContainerCommand(parseContainerAction(action), parseContainerName(name))
    const { code, text } = await this.execMaybeSudo(command, sudoPassword)
    if (looksMissingDocker(text)) throw new Error('Docker is not installed.')
    if (looksDockerDaemonDown(text)) throw new Error('Docker is installed but the daemon is not running.')
    if (looksServicePermission(text)) throw new Error('Sudo password required.')
    if (code && code !== 0) {
      throw new Error(text.replace(/\s+/g, ' ').trim().slice(0, 220) || `docker ${action} failed.`)
    }
  }

  async listDir(dirPath: string): Promise<RemoteFile[]> {
    const normalized = normalizePath(dirPath)
    const pending = this.dirInflight.get(normalized)
    if (pending) return pending
    const work = this.listDirNow(normalized).finally(() => {
      this.dirInflight.delete(normalized)
    })
    this.dirInflight.set(normalized, work)
    return work
  }

  private listDirNow(normalized: string): Promise<RemoteFile[]> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      sftp.readdir(normalized, (error, list) => {
        if (error) {
          reject(error)
          return
        }
        const files = list
          .filter((entry) => entry.filename !== '.' && entry.filename !== '..')
          .map((entry) => ({
            name: entry.filename,
            path: posix.join(normalized, entry.filename),
            isDirectory: entry.attrs.isDirectory(),
            isSymlink: entry.attrs.isSymbolicLink(),
            size: entry.attrs.size,
            modifiedAt: entry.attrs.mtime * 1000,
            permissions: modeString(entry.attrs.mode),
          }))
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          })
        resolve(files)
      })
    })
  }

  async stat(filePath: string): Promise<FileStat> {
    const target = this.cleanPath(filePath)
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      sftp.stat(target, (error, stats) => {
        if (error || !stats) {
          reject(error ?? new Error('Could not read path'))
          return
        }
        resolve({
          path: target,
          size: stats.size,
          modifiedAt: stats.mtime * 1000,
          isDirectory: stats.isDirectory(),
        })
      })
    })
  }

  async readFile(filePath: string): Promise<string> {
    const sftp = this.requireSftp()
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      sftp.stat(filePath, (statError, stats) => {
        if (statError) {
          reject(statError)
          return
        }
        if (stats.isDirectory()) {
          reject(new Error('Path is a directory'))
          return
        }
        if (stats.size > MAX_EDIT_BYTES) {
          reject(new Error(`File is larger than ${Math.round(MAX_EDIT_BYTES / 1024 / 1024)} MB`))
          return
        }
        const chunks: Buffer[] = []
        const stream = sftp.createReadStream(filePath)
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(Buffer.concat(chunks)))
      })
    })
    return buffer.toString('utf8')
  }

  async writeFile(filePath: string, content: string, sudoPassword?: string): Promise<void> {
    const target = this.cleanPath(filePath)
    if (sudoPassword !== undefined) {
      await this.writeElevated(target, Buffer.from(content, 'utf8'), sudoPassword)
      return
    }
    try {
      await this.sftpWrite(target, Buffer.from(content, 'utf8'))
    } catch (error) {
      if (!isDenied(error)) throw error
      await this.writeElevated(target, Buffer.from(content, 'utf8'))
    }
  }

  async mkdir(dirPath: string, sudoPassword?: string): Promise<void> {
    const target = this.cleanPath(dirPath)
    if (sudoPassword !== undefined) {
      await this.sudoExec(`mkdir -p -- ${shellQuote(target)}`, sudoPassword)
      return
    }
    try {
      await this.sftpMkdir(target)
    } catch (error) {
      if (!isDenied(error)) throw error
      await this.sudoExec(`mkdir -p -- ${shellQuote(target)}`)
    }
  }

  async rename(fromPath: string, toPath: string, sudoPassword?: string): Promise<void> {
    const from = this.cleanPath(fromPath)
    const to = this.cleanPath(toPath)
    if (sudoPassword !== undefined) {
      await this.sudoExec(`mv -f -- ${shellQuote(from)} ${shellQuote(to)}`, sudoPassword)
      return
    }
    try {
      await this.sftpRename(from, to)
    } catch (error) {
      if (!isDenied(error)) throw error
      await this.sudoExec(`mv -f -- ${shellQuote(from)} ${shellQuote(to)}`)
    }
  }

  async remove(targetPath: string, sudoPassword?: string): Promise<void> {
    const target = this.cleanPath(targetPath)
    if (target === '/') throw new Error('Cannot delete the root directory')
    if (sudoPassword !== undefined) {
      await this.sudoExec(`rm -rf -- ${shellQuote(target)}`, sudoPassword)
      return
    }
    try {
      await this.sftpRemove(target)
    } catch (error) {
      if (!isDenied(error)) throw error
      await this.sudoExec(`rm -rf -- ${shellQuote(target)}`)
    }
  }

  async search(dirPath: string, query: string, options?: SearchOptions): Promise<RemoteFile[]> {
    const root = this.cleanPath(dirPath)
    const trimmed = query.trim()
    if (!trimmed) return []
    if (trimmed.length > 80) throw new Error('Search is too long')
    const safe = trimmed.replace(/[*?[\]\\]/g, '')
    if (!safe) return []
    const maxDepth = Number.isInteger(options?.maxDepth) ? Math.min(6, Math.max(1, options!.maxDepth!)) : 5
    const limit = Number.isInteger(options?.limit) ? Math.min(250, Math.max(1, options!.limit!)) : 120
    const kinds = options?.dirsOnly
      ? "-type d -printf 'd\\t%p\\n'"
      : "\\( -type d -printf 'd\\t%p\\n' -o -type f -printf 'f\\t%p\\n' -o -type l -printf 'l\\t%p\\n' \\)"
    const raw = await this.exec(
      `find ${shellQuote(root)} -maxdepth ${maxDepth} -iname ${shellQuote(`*${safe}*`)} ${kinds} 2>/dev/null | head -n ${limit}`,
    )
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [kind, ...rest] = line.split('\t')
        const foundPath = rest.join('\t')
        if (!foundPath) return null
        const isDirectory = kind === 'd'
        return {
          name: posix.basename(foundPath) || foundPath,
          path: foundPath,
          isDirectory,
          isSymlink: kind === 'l',
          size: 0,
          modifiedAt: 0,
          permissions: '',
        } satisfies RemoteFile
      })
      .filter((entry): entry is RemoteFile => Boolean(entry))
  }

  async grep(dirPath: string, query: string, options?: SearchOptions): Promise<ContentHit[]> {
    const raw = await this.exec(buildGrepCommand(dirPath, query, options))
    return parseGrepHits(raw)
  }

  async runSiteAction(action: SiteAction, sudoPassword?: string): Promise<string> {
    const command = buildSiteCommand(parseSiteAction(action))
    const result = await this.execMaybeSudo(command, sudoPassword)
    const text = result.text.replace(/\s+/g, ' ').trim()
    if (result.code && result.code !== 0) {
      throw new Error(text.slice(0, 400) || `${action} failed.`)
    }
    return text || 'Done.'
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const remote = this.cleanPath(remotePath)
    const info = await this.stat(remote)
    if (info.isDirectory) {
      await this.downloadTree(remote, localPath)
      return
    }
    const name = posix.basename(remote)
    const id = randomUUID()
    this.emitTransfer({ id, kind: 'download', name, transferred: 0, total: 0, status: 'running' })
    try {
      const result = await this.sftpGet(remote, localPath, (transferred, total) => {
        this.emitTransfer({ id, kind: 'download', name, transferred, total, status: 'running' })
      })
      this.assertTransferActive(id)
      this.emitTransfer({
        id,
        kind: 'download',
        name,
        transferred: result.total || result.transferred,
        total: result.total || result.transferred,
        status: 'done',
      })
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'Transfer cancelled.'
      this.emitTransfer({
        id,
        kind: 'download',
        name,
        transferred: 0,
        total: 0,
        status: cancelled ? 'cancelled' : 'error',
        error: cancelled ? 'Cancelled' : formatSshError(error),
      })
      throw error
    }
  }

  async uploadFile(localPath: string, remotePath: string, sudoPassword?: string): Promise<void> {
    const local = await fsStat(localPath)
    if (local.isDirectory()) {
      await this.uploadTree(localPath, this.cleanPath(remotePath), sudoPassword)
      return
    }
    const remote = this.cleanPath(remotePath)
    const name = posix.basename(remote)
    const id = randomUUID()
    this.emitTransfer({ id, kind: 'upload', name, transferred: 0, total: 0, status: 'running' })
    const track = (transferred: number, total: number) => {
      this.emitTransfer({ id, kind: 'upload', name, transferred, total, status: 'running' })
    }
    try {
      await this.putLocalFile(localPath, remote, sudoPassword, track)
      this.assertTransferActive(id)
      this.emitTransfer({ id, kind: 'upload', name, transferred: 1, total: 1, status: 'done' })
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'Transfer cancelled.'
      this.emitTransfer({
        id,
        kind: 'upload',
        name,
        transferred: 0,
        total: 0,
        status: cancelled ? 'cancelled' : 'error',
        error: cancelled ? 'Cancelled' : formatSshError(error),
      })
      throw error
    }
  }

  private async putLocalFile(
    localPath: string,
    remote: string,
    sudoPassword: string | undefined,
    track: (transferred: number, total: number) => void,
  ): Promise<void> {
    if (sudoPassword !== undefined) {
      await this.uploadElevated(localPath, remote, sudoPassword, track)
      return
    }
    try {
      await this.sftpPut(localPath, remote, track)
    } catch (error) {
      if (!isDenied(error)) throw error
      await this.uploadElevated(localPath, remote, undefined, track)
    }
  }

  private sftpGet(
    remote: string,
    localPath: string,
    onStep?: (transferred: number, total: number) => void,
  ): Promise<{ transferred: number; total: number }> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      let lastTotal = 0
      let lastTransferred = 0
      sftp.fastGet(
        remote,
        localPath,
        {
          step: (transferred, _chunk, total) => {
            lastTotal = total
            lastTransferred = transferred
            onStep?.(transferred, total)
          },
        },
        (error) => {
          if (error) {
            reject(error)
            return
          }
          resolve({ transferred: lastTransferred, total: lastTotal })
        },
      )
    })
  }

  private async downloadTree(remoteDir: string, localDir: string): Promise<void> {
    const name = posix.basename(remoteDir)
    const id = randomUUID()
    const items: { remote: string; local: string; dir: boolean }[] = []
    await this.walkRemote(remoteDir, localDir, 0, items)
    const files = items.filter((item) => !item.dir)
    this.emitTransfer({ id, kind: 'download', name, transferred: 0, total: Math.max(1, files.length), status: 'running' })
    try {
      let done = 0
      for (const item of items) {
        this.assertTransferActive(id)
        if (item.dir) await mkdir(item.local, { recursive: true })
        else {
          await this.sftpGet(item.remote, item.local)
          done += 1
          this.emitTransfer({ id, kind: 'download', name, transferred: done, total: files.length, status: 'running' })
        }
      }
      this.emitTransfer({ id, kind: 'download', name, transferred: files.length, total: Math.max(1, files.length), status: 'done' })
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'Transfer cancelled.'
      this.emitTransfer({
        id,
        kind: 'download',
        name,
        transferred: 0,
        total: files.length,
        status: cancelled ? 'cancelled' : 'error',
        error: cancelled ? 'Cancelled' : formatSshError(error),
      })
      throw error
    }
  }

  private async uploadTree(localDir: string, remoteDir: string, sudoPassword?: string): Promise<void> {
    const name = path.basename(localDir)
    const id = randomUUID()
    const items: { local: string; remote: string; dir: boolean }[] = []
    await this.walkLocal(localDir, remoteDir, 0, items)
    const files = items.filter((item) => !item.dir)
    this.emitTransfer({ id, kind: 'upload', name, transferred: 0, total: Math.max(1, files.length), status: 'running' })
    try {
      let done = 0
      for (const item of items) {
        this.assertTransferActive(id)
        if (item.dir) {
          try {
            await this.mkdir(item.remote, sudoPassword)
          } catch (error) {
            const message = formatSshError(error).toLowerCase()
            if (!message.includes('exist')) throw error
          }
        } else {
          await this.putLocalFile(item.local, item.remote, sudoPassword, () => undefined)
          done += 1
          this.emitTransfer({ id, kind: 'upload', name, transferred: done, total: files.length, status: 'running' })
        }
      }
      this.emitTransfer({ id, kind: 'upload', name, transferred: files.length, total: Math.max(1, files.length), status: 'done' })
    } catch (error) {
      const cancelled = error instanceof Error && error.message === 'Transfer cancelled.'
      this.emitTransfer({
        id,
        kind: 'upload',
        name,
        transferred: 0,
        total: files.length,
        status: cancelled ? 'cancelled' : 'error',
        error: cancelled ? 'Cancelled' : formatSshError(error),
      })
      throw error
    }
  }

  private async walkRemote(
    remoteDir: string,
    localDir: string,
    depth: number,
    out: { remote: string; local: string; dir: boolean }[],
  ): Promise<void> {
    if (depth > 12) throw new Error('That folder is nested too deeply to transfer.')
    if (out.length > 2000) throw new Error('That folder has too many items to transfer (max 2000).')
    out.push({ remote: remoteDir, local: localDir, dir: true })
    const entries = await this.listDir(remoteDir)
    for (const entry of entries) {
      if (entry.isSymlink) continue
      const local = path.join(localDir, entry.name)
      if (entry.isDirectory) await this.walkRemote(entry.path, local, depth + 1, out)
      else out.push({ remote: entry.path, local, dir: false })
    }
  }

  private async walkLocal(
    localDir: string,
    remoteDir: string,
    depth: number,
    out: { local: string; remote: string; dir: boolean }[],
  ): Promise<void> {
    if (depth > 12) throw new Error('That folder is nested too deeply to transfer.')
    if (out.length > 2000) throw new Error('That folder has too many items to transfer (max 2000).')
    out.push({ local: localDir, remote: remoteDir, dir: true })
    const entries = await readdir(localDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const local = path.join(localDir, entry.name)
      const remote = posix.join(remoteDir, entry.name)
      if (entry.isDirectory()) await this.walkLocal(local, remote, depth + 1, out)
      else if (entry.isFile()) out.push({ local, remote, dir: false })
    }
  }

  async chmod(targetPath: string, mode: string, sudoPassword?: string): Promise<void> {
    const parsed = Number.parseInt(mode.replace(/^0/, '') || mode, 8)
    if (Number.isNaN(parsed)) throw new Error('Invalid permissions. Use something like 644 or 755.')
    const octal = parsed.toString(8)
    const target = this.cleanPath(targetPath)
    if (sudoPassword !== undefined) {
      await this.sudoExec(`chmod ${octal} -- ${shellQuote(target)}`, sudoPassword)
      return
    }
    try {
      await this.sftpChmod(target, parsed)
    } catch (error) {
      if (!isDenied(error)) throw error
      await this.sudoExec(`chmod ${octal} -- ${shellQuote(target)}`)
    }
  }

  async getStats(): Promise<ServerStats> {
    if (this.statsInflight) return this.statsInflight
    this.statsInflight = this.exec(STATS_SCRIPT)
      .then(parseHealth)
      .finally(() => {
        this.statsInflight = null
      })
    return this.statsInflight
  }

  async getHealth(): Promise<ServerStats> {
    if (this.healthInflight) return this.healthInflight
    this.healthInflight = this.exec(HEALTH_SCRIPT)
      .then(parseHealth)
      .finally(() => {
        this.healthInflight = null
      })
    return this.healthInflight
  }

  async getRuntime(): Promise<RuntimeSnapshot> {
    if (this.runtimeInflight) return this.runtimeInflight
    this.runtimeInflight = this.exec(RUNTIME_SCRIPT)
      .then(parseRuntime)
      .finally(() => {
        this.runtimeInflight = null
      })
    return this.runtimeInflight
  }

  async getSecurity(): Promise<SecuritySnapshot> {
    if (this.securityInflight) return this.securityInflight
    this.securityInflight = this.exec(SECURITY_SCRIPT)
      .then((raw) => parseSecurity(raw))
      .finally(() => {
        this.securityInflight = null
      })
    return this.securityInflight
  }

  async controlPm2(name: string, action: Pm2Action): Promise<void> {
    const { code, text } = await this.execResult(buildPm2Command(parsePm2Action(action), parsePm2Name(name)))
    if (code && code !== 0) {
      throw new Error(text.replace(/\s+/g, ' ').trim().slice(0, 220) || `pm2 ${action} failed.`)
    }
  }

  async controlCompose(name: string, action: ComposeAction, configFile?: string): Promise<void> {
    const { code, text } = await this.execResult(
      buildComposeCommand(parseComposeAction(action), parseComposeName(name), configFile),
    )
    if (code && code !== 0) {
      throw new Error(text.replace(/\s+/g, ' ').trim().slice(0, 220) || `Compose ${action} failed.`)
    }
  }

  async disconnect(): Promise<void> {
    this.ignoreClose = true
    const client = this.client
    const jump = this.jumpClient
    const tunnels = [...this.tunnels.values()]
    this.tunnels.clear()
    this.remoteForwards.clear()
    this.dirInflight.clear()
    this.statsInflight = null
    this.healthInflight = null
    for (const shell of this.shells.values()) {
      if (shell.flushTimer) clearImmediate(shell.flushTimer)
      try {
        shell.channel.close()
      } catch {
        // ignore
      }
    }
    this.shells.clear()
    for (const log of this.logs.values()) {
      try {
        log.channel.close()
      } catch {
        // ignore
      }
    }
    this.logs.clear()
    this.sftp = null
    this.client = null
    this.jumpClient = null
    this.connection = null
    await Promise.all(tunnels.map((tunnel) => tunnel.stop().catch(() => undefined)))
    if (!client && !jump) return
    await new Promise<void>((resolve) => {
      endQuiet(client)
      endQuiet(jump)
      setTimeout(resolve, 50)
    })
  }

  private pushOutput(shellId: string, data: string): void {
    const shell = this.shells.get(shellId)
    if (!shell) return
    if (!shell.ready) {
      shell.pending.push(data)
      if (shell.pending.length > 200) shell.pending.shift()
      return
    }
    shell.pendingOut += data
    if (shell.flushTimer) return
    shell.flushTimer = setImmediate(() => {
      shell.flushTimer = null
      const chunk = shell.pendingOut
      shell.pendingOut = ''
      if (chunk) this.dataListener?.(shellId, chunk)
    })
  }

  private listenLocal(port: number): Promise<net.Server> {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      const fail = (error: Error) => {
        server.close()
        reject(error)
      }
      server.once('error', fail)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', fail)
        resolve(server)
      })
    })
  }

  private async openLocalTunnel(id: string, client: Client, draft: TunnelDraft): Promise<TunnelInfo> {
    const destHost = draft.destHost || '127.0.0.1'
    const destPort = draft.destPort
    if (!destPort) throw new Error('Destination port is required.')
    const server = await this.listenLocal(draft.listenPort)
    server.on('connection', (socket) => {
      client.forwardOut(socket.remoteAddress || '127.0.0.1', socket.remotePort || 0, destHost, destPort, (error, stream) => {
        if (error || !stream) {
          socket.destroy()
          return
        }
        socket.pipe(stream)
        stream.pipe(socket)
      })
    })
    const info: TunnelInfo = { id, kind: 'local', listenPort: draft.listenPort, destHost, destPort }
    this.tunnels.set(id, {
      info,
      stop: () =>
        new Promise((resolve) => {
          server.close(() => resolve())
        }),
    })
    return info
  }

  private async openSocksTunnel(id: string, client: Client, draft: TunnelDraft): Promise<TunnelInfo> {
    const server = await this.listenLocal(draft.listenPort)
    server.on('connection', (socket) => {
      handleSocksConnection(socket, (host, port) => {
        return new Promise((resolve, reject) => {
          client.forwardOut('127.0.0.1', 0, host, port, (error, stream) => {
            if (error || !stream) {
              reject(error ?? new Error('Could not open SOCKS channel.'))
              return
            }
            resolve(stream)
          })
        })
      })
    })
    const info: TunnelInfo = { id, kind: 'socks', listenPort: draft.listenPort }
    this.tunnels.set(id, {
      info,
      stop: () =>
        new Promise((resolve) => {
          server.close(() => resolve())
        }),
    })
    return info
  }

  private async openRemoteTunnel(id: string, client: Client, draft: TunnelDraft): Promise<TunnelInfo> {
    const destHost = draft.destHost || '127.0.0.1'
    const destPort = draft.destPort
    if (!destPort) throw new Error('Destination port is required.')
    await new Promise<void>((resolve, reject) => {
      client.forwardIn('127.0.0.1', draft.listenPort, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    this.remoteForwards.set(draft.listenPort, { destHost, destPort })
    const info: TunnelInfo = { id, kind: 'remote', listenPort: draft.listenPort, destHost, destPort }
    this.tunnels.set(id, {
      info,
      stop: () =>
        new Promise((resolve) => {
          this.remoteForwards.delete(draft.listenPort)
          client.unforwardIn('127.0.0.1', draft.listenPort, () => resolve())
        }),
    })
    return info
  }

  private requireSftp(): SFTPWrapper {
    if (!this.sftp) throw new Error('Not connected')
    return this.sftp
  }

  private tempRemotePath(): string {
    return `/tmp/.barepane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  private async writeElevated(target: string, data: Buffer, password?: string): Promise<void> {
    const tmp = this.tempRemotePath()
    await this.sftpWrite(tmp, data)
    try {
      await this.sudoExec(`mv -f -- ${shellQuote(tmp)} ${shellQuote(target)}`, password)
    } catch (error) {
      await this.sftpUnlink(tmp).catch(() => undefined)
      throw error
    }
  }

  private async uploadElevated(
    localPath: string,
    remotePath: string,
    password?: string,
    onStep?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const tmp = this.tempRemotePath()
    await this.sftpPut(localPath, tmp, onStep)
    try {
      await this.sudoExec(`mv -f -- ${shellQuote(tmp)} ${shellQuote(remotePath)}`, password)
    } catch (error) {
      await this.sftpUnlink(tmp).catch(() => undefined)
      throw error
    }
  }

  private sftpWrite(target: string, data: Buffer): Promise<void> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(target)
      let settled = false
      const succeed = () => {
        if (settled) return
        settled = true
        resolve()
      }
      stream.on('error', (error: Error) => {
        if (settled) return
        settled = true
        reject(error)
      })
      stream.on('close', succeed)
      stream.on('finish', succeed)
      stream.end(data)
    })
  }

  private sftpPut(
    localPath: string,
    remotePath: string,
    onStep?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      sftp.fastPut(
        localPath,
        remotePath,
        {
          step: (transferred, _chunk, total) => onStep?.(transferred, total),
        },
        (error) => {
          if (error) reject(error)
          else resolve()
        },
      )
    })
  }

  private sftpMkdir(target: string): Promise<void> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      sftp.mkdir(target, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private sftpRename(from: string, to: string): Promise<void> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      sftp.rename(from, to, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private sftpChmod(target: string, mode: number): Promise<void> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      sftp.chmod(target, mode, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private sftpUnlink(target: string): Promise<void> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      sftp.unlink(target, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private async sftpRemove(target: string): Promise<void> {
    const sftp = this.requireSftp()
    const stats = await new Promise<import('ssh2').Stats>((resolve, reject) => {
      sftp.stat(target, (error, nextStats) => {
        if (error || !nextStats) {
          reject(error ?? new Error('Could not read path'))
          return
        }
        resolve(nextStats)
      })
    })

    if (stats.isDirectory()) {
      const children = await this.listDir(target)
      for (const child of children) {
        await this.sftpRemove(child.path)
      }
      await new Promise<void>((resolve, reject) => {
        sftp.rmdir(target, (error) => {
          if (error) reject(error)
          else resolve()
        })
      })
      return
    }

    await this.sftpUnlink(target)
  }

  private sudoExec(command: string, password?: string): Promise<string> {
    const client = this.client
    if (!client) return Promise.reject(new Error('Not connected'))
    const wrapped = password
      ? `sudo -S -p '' -- bash -lc ${shellQuote(command)}`
      : `sudo -n -- bash -lc ${shellQuote(command)}`

    return new Promise((resolve, reject) => {
      client.exec(wrapped, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error('Could not run sudo'))
          return
        }
        const stdout: Buffer[] = []
        const stderr: Buffer[] = []
        stream.on('data', (chunk: Buffer) => stdout.push(chunk))
        stream.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
        if (password) stream.write(`${password}\n`)
        stream.end()
        stream.on('close', (code: number | null) => {
          const outText = Buffer.concat(stdout).toString('utf8')
          const errText = Buffer.concat(stderr).toString('utf8')
          const text = `${outText}\n${errText}`
          const lower = text.toLowerCase()
          if (lower.includes('not in the sudoers') || lower.includes('not allowed to execute')) {
            reject(new Error('This user cannot use sudo.'))
            return
          }
          if (lower.includes('incorrect password attempt') || lower.includes('sorry, try again')) {
            reject(new Error('Sudo password incorrect.'))
            return
          }
          if (code !== 0 && !password) {
            reject(new Error('Sudo password required.'))
            return
          }
          if (code !== 0) {
            reject(new Error(errText.trim() || outText.trim() || `sudo failed (${code})`))
            return
          }
          resolve(outText)
        })
        stream.on('error', reject)
      })
    })
  }

  private cleanPath(target: string): string {
    if (!target || target.includes('\0') || target.includes('\n')) {
      throw new Error('Invalid path')
    }
    return normalizePath(target)
  }

  private realpath(target: string): Promise<string> {
    const sftp = this.requireSftp()
    return new Promise((resolve, reject) => {
      sftp.realpath(target, (error, absolute) => {
        if (error || !absolute) {
          reject(error ?? new Error('Could not resolve path'))
          return
        }
        resolve(absolute)
      })
    })
  }

  private exec(command: string): Promise<string> {
    const client = this.client
    if (!client) return Promise.reject(new Error('Not connected'))
    return new Promise((resolve, reject) => {
      client.exec(command, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error('Could not run command'))
          return
        }
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')))
        stream.on('error', reject)
      })
    })
  }

  private execResult(command: string): Promise<{ code: number | null; text: string }> {
    const client = this.client
    if (!client) return Promise.reject(new Error('Not connected'))
    return new Promise((resolve, reject) => {
      client.exec(command, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error('Could not run command'))
          return
        }
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('close', (code: number | null) => {
          resolve({ code, text: Buffer.concat(chunks).toString('utf8') })
        })
        stream.on('error', reject)
      })
    })
  }

  private async execMaybeSudo(command: string, sudoPassword?: string): Promise<{ code: number | null; text: string }> {
    if (sudoPassword) {
      const text = await this.sudoExec(command, sudoPassword)
      return { code: 0, text }
    }
    return this.execResult(command)
  }

  private execStream(command: string): Promise<ClientChannel> {
    const client = this.client
    if (!client) return Promise.reject(new Error('Not connected'))
    return new Promise((resolve, reject) => {
      client.exec(command, (error, stream) => {
        if (error || !stream) {
          reject(error ?? new Error('Could not follow this log'))
          return
        }
        resolve(stream)
      })
    })
  }
}

type HubEvents = {
  onData: (id: string, shellId: string, data: string) => void
  onLogData: (id: string, logId: string, data: string) => void
  onLogClosed: (id: string, logId: string, reason: string) => void
  onClose: (id: string, reason: string) => void
  onTransfer: (id: string, transfer: TransferProgress) => void
}

export class SessionHub {
  private sessions = new Map<string, SshSession>()
  private events: HubEvents | null = null

  setEvents(events: HubEvents): void {
    this.events = events
  }

  get(id: string): SshSession {
    const session = this.sessions.get(id)
    if (!session) throw new Error('This SSH session is no longer connected.')
    return session
  }

  connections(): ConnectResult[] {
    const list: ConnectResult[] = []
    for (const [id, session] of this.sessions) {
      const info = session.getConnection()
      if (info) list.push({ id, ...info })
    }
    return list
  }

  async connect(payload: ConnectPayload): Promise<ConnectResult> {
    const id = randomUUID()
    const session = new SshSession()
    session.onData((shellId, data) => this.events?.onData(id, shellId, data))
    session.onLogData((logId, data) => this.events?.onLogData(id, logId, data))
    session.onLogClosed((logId, reason) => this.events?.onLogClosed(id, logId, reason))
    session.onTransfer((transfer) => this.events?.onTransfer(id, transfer))
    session.onClose((reason) => {
      this.sessions.delete(id)
      this.events?.onClose(id, reason)
    })
    try {
      const info = await session.connect(payload)
      this.sessions.set(id, session)
      return { id, ...info }
    } catch (error) {
      await session.disconnect()
      throw error
    }
  }

  async disconnect(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    await session.disconnect()
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.sessions.keys()]
    await Promise.all(ids.map((id) => this.disconnect(id)))
  }

  cancelTransfer(id: string, transferId: string): void {
    this.sessions.get(id)?.cancelTransfer(transferId)
  }
}

export const sessionHub = new SessionHub()
