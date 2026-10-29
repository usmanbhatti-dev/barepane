import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { sessionHub, hasSshAgent } from './ssh'
import {
  checkForUpdates,
  checkFromMenu,
  downloadUpdate,
  getAppInfo,
  getUpdateState,
  initUpdater,
  installUpdate,
  openExternalLink,
  setAutoCheckUpdates,
  stopUpdater,
} from './updater'
import { APP_NAME } from '../../shared/brand'
import { formatSshError } from '../../shared/errors'
import { parseSshConfig, sshHostsToSessions } from '../../shared/sshConfig'
import { parseLocalHttpUrl } from '../../shared/tunnels'
import type { ComposeAction, ConnectPayload, ContainerAction, LogDraft, Pm2Action, SavedSession, SearchOptions, ServiceAction, SiteAction, TunnelDraft } from '../../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

app.setName(APP_NAME)
app.enableSandbox()

if (process.platform === 'win32') {
  app.setAppUserModelId(app.getName())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function contentSecurityPolicy(): string {
  const connect = DEV_SERVER_URL
    ? "'self' ws: http://127.0.0.1:* http://localhost:*"
    : "'self'"
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

// A dropped SSH socket or a half-closed stream must never show Electron's raw "JavaScript error in the
// main process" dialog or take other open sessions down. Log one short line locally and carry on.
function logFault(label: string, error: unknown): void {
  const text = error instanceof Error ? error.message : String(error)
  console.error(`[main] ${label}:`, text.split('\n')[0]?.slice(0, 300))
}

process.on('uncaughtException', (error) => logFault('uncaught exception', error))
process.on('unhandledRejection', (reason) => logFault('unhandled rejection', reason))

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!(DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL))) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

function hardenSession(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()],
      },
    })
  })
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  win?.webContents.send(channel, ...args)
}

function assertSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (!win || event.sender.id !== win.webContents.id) {
    throw new Error('Unauthorized')
  }
}

async function invoke<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw new Error(formatSshError(error))
  }
}

function defaultKeyPaths(): string[] {
  const dir = path.join(os.homedir(), '.ssh')
  return ['id_ed25519', 'id_rsa', 'id_ecdsa']
    .map((name) => path.join(dir, name))
    .filter((file) => existsSync(file))
}

function expandHome(filePath: string): string {
  if (filePath === '~') return os.homedir()
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) return path.join(os.homedir(), filePath.slice(2))
  return filePath
}

function readSshConfigSessions(): SavedSession[] {
  const file = path.join(os.homedir(), '.ssh', 'config')
  if (!existsSync(file)) return []
  try {
    const hosts = parseSshConfig(readFileSync(file, 'utf8'), { defaultUser: os.userInfo().username })
    return sshHostsToSessions(hosts).map((session) => {
      if (session.privateKeyPath) session.privateKeyPath = expandHome(session.privateKeyPath)
      if (session.jump?.privateKeyPath) session.jump.privateKeyPath = expandHome(session.jump.privateKeyPath)
      return session
    })
  } catch {
    return []
  }
}

function installMenu(): void {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [
          { label: `${APP_NAME} Website`, click: () => void openExternalLink('website') },
          { label: 'Release Notes', click: () => void openExternalLink('releases') },
          { label: 'Report an Issue…', click: () => void openExternalLink('issues') },
          { label: 'Privacy', click: () => void openExternalLink('privacy') },
          { type: 'separator' },
          { label: 'Check for Updates…', click: () => void checkFromMenu() },
        ],
      },
    ]),
  )
}

function appIconPath(): string {
  return path.join(process.env.VITE_PUBLIC ?? RENDERER_DIST, 'icon.png')
}

function loadAppIcon() {
  const file = appIconPath()
  if (!existsSync(file)) return undefined
  const image = nativeImage.createFromPath(file)
  return image.isEmpty() ? undefined : image
}

function resetTitle(): void {
  win?.setTitle(APP_NAME)
}

async function createWindow() {
  installMenu()
  const icon = loadAppIcon()
  win = new BrowserWindow({
    title: APP_NAME,
    show: false,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0F1218',
    ...(icon ? { icon } : {}),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 14, y: 14 },
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: '#0a0d12',
            symbolColor: '#f6f6f6',
            height: 40,
          },
        }
      : {}),
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      navigateOnDragDrop: false,
    },
  })

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL)
  } else {
    void win.loadFile(indexHtml)
  }

  // If the window's renderer process dies, say so plainly instead of leaving a blank window.
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || !win) return
    logFault('renderer gone', details.reason)
    const choice = dialog.showMessageBoxSync(win, {
      type: 'error',
      buttons: ['Reload window', 'Quit'],
      defaultId: 0,
      cancelId: 1,
      title: APP_NAME,
      message: `${APP_NAME}'s window stopped unexpectedly.`,
      detail: 'Reloading closes your SSH sessions (saved servers are kept). Unsaved editor changes are lost.',
    })
    if (choice === 0) {
      void sessionHub.disconnectAll().finally(() => win?.reload())
    } else {
      app.quit()
    }
  })

  win.once('ready-to-show', () => {
    win?.show()
    win?.focus()
  })

  win.on('closed', () => {
    win = null
    void sessionHub.disconnectAll()
  })
}

function sessionId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Missing SSH session')
  }
  return value
}

function updateTitle(): void {
  const list = sessionHub.connections()
  if (!list.length) {
    resetTitle()
    return
  }
  const label = list.map((item) => `${item.username}@${item.host}`).join(' · ')
  win?.setTitle(`${label} — ${APP_NAME}`)
}

sessionHub.setEvents({
  onData: (id, shellId, data) => sendToRenderer('ssh:terminal-data', id, shellId, data),
  onLogData: (id, logId, data) => sendToRenderer('ssh:log-data', id, logId, data),
  onLogClosed: (id, logId, reason) => sendToRenderer('ssh:log-closed', id, logId, reason),
  onClose: (id, reason) => {
    updateTitle()
    sendToRenderer('ssh:disconnected', id, reason)
  },
  onTransfer: (id, transfer) => sendToRenderer('ssh:transfer', id, transfer),
})

ipcMain.handle('ssh:connect', async (event, payload: ConnectPayload) => {
  assertSender(event)
  const result = await invoke(() => sessionHub.connect(payload))
  updateTitle()
  return result
})

ipcMain.handle('ssh:disconnect', async (event, id: string) => {
  assertSender(event)
  await sessionHub.disconnect(sessionId(id))
  updateTitle()
})

ipcMain.handle('ssh:list', async (event, id: string, dirPath: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).listDir(dirPath))
})

ipcMain.handle('ssh:stat', async (event, id: string, filePath: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).stat(filePath))
})

ipcMain.handle('ssh:read-file', async (event, id: string, filePath: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).readFile(filePath))
})

ipcMain.handle('ssh:write-file', async (event, id: string, filePath: string, content: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).writeFile(filePath, content, sudoPassword))
})

ipcMain.handle('ssh:mkdir', async (event, id: string, dirPath: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).mkdir(dirPath, sudoPassword))
})

ipcMain.handle('ssh:rename', async (event, id: string, fromPath: string, toPath: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).rename(fromPath, toPath, sudoPassword))
})

ipcMain.handle('ssh:remove', async (event, id: string, targetPath: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).remove(targetPath, sudoPassword))
})

ipcMain.handle('ssh:search', async (event, id: string, dirPath: string, query: string, options?: SearchOptions) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).search(dirPath, query, options))
})

ipcMain.handle('ssh:grep', async (event, id: string, dirPath: string, query: string, options?: SearchOptions) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).grep(dirPath, query, options))
})

ipcMain.handle('ssh:site-action', async (event, id: string, action: SiteAction, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).runSiteAction(action, optionalSecret(sudoPassword)))
})

ipcMain.handle('ssh:reboot', async (event, id: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).rebootHost(optionalSecret(sudoPassword)))
})

ipcMain.handle('ssh:download', async (event, id: string, remotePath: string, localPath: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).downloadFile(remotePath, localPath))
})

ipcMain.handle('ssh:upload', async (event, id: string, localPath: string, remotePath: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).uploadFile(localPath, remotePath, sudoPassword))
})

ipcMain.handle('ssh:transfer-cancel', async (event, id: string, transferId: string) => {
  assertSender(event)
  sessionHub.cancelTransfer(sessionId(id), String(transferId || ''))
})

ipcMain.handle('ssh:read-config', async (event) => {
  assertSender(event)
  return readSshConfigSessions()
})

ipcMain.handle('ssh:chmod', async (event, id: string, targetPath: string, mode: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).chmod(targetPath, mode, sudoPassword))
})

ipcMain.handle('clipboard:read', (event) => {
  assertSender(event)
  return clipboard.readText()
})

ipcMain.handle('clipboard:write', (event, text: unknown) => {
  assertSender(event)
  clipboard.writeText(typeof text === 'string' ? text : '')
})

ipcMain.handle('app:info', (event) => {
  assertSender(event)
  return getAppInfo()
})

ipcMain.handle('app:update-state', (event) => {
  assertSender(event)
  return getUpdateState()
})

ipcMain.handle('app:check-updates', (event) => {
  assertSender(event)
  return checkForUpdates(true)
})

ipcMain.handle('app:download-update', (event) => {
  assertSender(event)
  return downloadUpdate()
})

ipcMain.handle('app:install-update', async (event) => {
  assertSender(event)
  await installUpdate()
})

ipcMain.handle('app:set-auto-check', (event, enabled: unknown) => {
  assertSender(event)
  return setAutoCheckUpdates(enabled === true)
})

ipcMain.handle('app:open-link', async (event, id: unknown) => {
  assertSender(event)
  await openExternalLink(id)
})

ipcMain.handle('shell:open-local', async (event, url: unknown) => {
  assertSender(event)
  await shell.openExternal(parseLocalHttpUrl(url))
})

ipcMain.handle('dialog:save', async (event, defaultName: string) => {
  assertSender(event)
  if (!win) return null
  const result = await dialog.showSaveDialog(win, { defaultPath: defaultName })
  return result.canceled ? null : result.filePath ?? null
})

ipcMain.handle('dialog:open', async (event) => {
  assertSender(event)
  if (!win) return [] as string[]
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'openDirectory', 'multiSelections'],
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('dialog:directory', async (event) => {
  assertSender(event)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0] ?? null
})

ipcMain.handle('dialog:private-key', async (event) => {
  assertSender(event)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    defaultPath: path.join(os.homedir(), '.ssh'),
    properties: ['openFile'],
    title: 'Choose SSH private key',
    filters: [
      { name: 'SSH keys', extensions: ['pem', 'key'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  return result.canceled ? null : result.filePaths[0] ?? null
})

ipcMain.handle('dialog:save-text', async (event, defaultName: string, content: string) => {
  assertSender(event)
  if (!win) return false
  if (typeof content !== 'string' || content.length > 1_000_000) {
    throw new Error('That file is too large to save.')
  }
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return false
  writeFileSync(result.filePath, content, 'utf8')
  return true
})

ipcMain.handle('dialog:open-text', async (event) => {
  assertSender(event)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  const file = result.filePaths[0]
  if (result.canceled || !file) return null
  const text = readFileSync(file, 'utf8')
  if (text.length > 1_000_000) throw new Error('That file is too large to open.')
  return text
})

ipcMain.handle('ssh:default-keys', async (event) => {
  assertSender(event)
  return defaultKeyPaths()
})

ipcMain.handle('ssh:has-agent', async (event) => {
  assertSender(event)
  return hasSshAgent()
})

ipcMain.handle('ssh:stats', async (event, id: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).getStats())
})

ipcMain.handle('ssh:health', async (event, id: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).getHealth())
})

ipcMain.handle('ssh:runtime', async (event, id: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).getRuntime())
})

ipcMain.handle('ssh:security', async (event, id: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).getSecurity())
})

ipcMain.handle('ssh:pm2-control', async (event, id: string, name: string, action: Pm2Action) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).controlPm2(name, action))
})

ipcMain.handle('ssh:compose-control', async (event, id: string, name: string, action: ComposeAction, configFile?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).controlCompose(name, action, configFile))
})

ipcMain.handle('ssh:open-shell', async (event, id: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).openShell())
})

ipcMain.handle('ssh:close-shell', async (event, id: string, shellId: string) => {
  assertSender(event)
  await sessionHub.get(sessionId(id)).closeShell(sessionId(shellId))
})

ipcMain.handle('ssh:list-shells', async (event, id: string) => {
  assertSender(event)
  return sessionHub.get(sessionId(id)).listShells()
})

ipcMain.handle('ssh:tunnel-open', async (event, id: string, draft: TunnelDraft) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).openTunnel(draft))
})

ipcMain.handle('ssh:tunnel-close', async (event, id: string, tunnelId: string) => {
  assertSender(event)
  await sessionHub.get(sessionId(id)).closeTunnel(sessionId(tunnelId))
})

ipcMain.handle('ssh:tunnel-list', async (event, id: string) => {
  assertSender(event)
  return sessionHub.get(sessionId(id)).listTunnels()
})

ipcMain.handle('ssh:log-open', async (event, id: string, draft: LogDraft, sudoPassword?: string) => {
  assertSender(event)
  const password = typeof sudoPassword === 'string' && sudoPassword ? sudoPassword : undefined
  return invoke(() => sessionHub.get(sessionId(id)).openLog(draft, password))
})

ipcMain.handle('ssh:log-close', async (event, id: string, logId: string) => {
  assertSender(event)
  await sessionHub.get(sessionId(id)).closeLog(sessionId(logId))
})

ipcMain.handle('ssh:log-list', async (event, id: string) => {
  assertSender(event)
  return sessionHub.get(sessionId(id)).listLogs()
})

function optionalSecret(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

ipcMain.handle('ssh:units-list', async (event, id: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).listUnits(optionalSecret(sudoPassword)))
})

ipcMain.handle('ssh:units-control', async (event, id: string, unit: string, action: ServiceAction, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).controlUnit(unit, action, optionalSecret(sudoPassword)))
})

ipcMain.handle('ssh:containers-list', async (event, id: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).listContainers(optionalSecret(sudoPassword)))
})

ipcMain.handle('ssh:docker-inventory', async (event, id: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).getDockerInventory(optionalSecret(sudoPassword)))
})

ipcMain.handle('ssh:container-inspect', async (event, id: string, name: string, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).inspectContainer(name, optionalSecret(sudoPassword)))
})

ipcMain.handle('ssh:containers-control', async (event, id: string, name: string, action: ContainerAction, sudoPassword?: string) => {
  assertSender(event)
  return invoke(() => sessionHub.get(sessionId(id)).controlContainer(name, action, optionalSecret(sudoPassword)))
})

ipcMain.on('ssh:terminal-input', (event, id: string, shellId: string, data: string) => {
  assertSender(event)
  try {
    sessionHub.get(sessionId(id)).writeTerminal(sessionId(shellId), data)
  } catch {
    // session already closed
  }
})

ipcMain.on('ssh:terminal-input-all', (event, id: string, data: string) => {
  assertSender(event)
  try {
    sessionHub.get(sessionId(id)).writeAllTerminals(data)
  } catch {
    // session already closed
  }
})

ipcMain.on('ssh:terminal-resize', (event, id: string, shellId: string, size: { cols: number; rows: number }) => {
  assertSender(event)
  try {
    sessionHub.get(sessionId(id)).resizeTerminal(sessionId(shellId), size.cols, size.rows)
  } catch {
    // session already closed
  }
})

ipcMain.on('ssh:terminal-ready', (event, id: string, shellId: string) => {
  assertSender(event)
  try {
    sessionHub.get(sessionId(id)).markTerminalReady(sessionId(shellId))
  } catch {
    // session already closed
  }
})

app.whenReady().then(() => {
  hardenSession()
  initUpdater({
    onState: (next) => sendToRenderer('app:update-state-changed', next),
    sessionCount: () => sessionHub.connections().length,
  })
  void createWindow()
})

app.on('window-all-closed', () => {
  win = null
  void sessionHub.disconnectAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopUpdater()
  void sessionHub.disconnectAll()
})

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('activate', () => {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length) {
    windows[0].focus()
    return
  }
  void createWindow()
})
