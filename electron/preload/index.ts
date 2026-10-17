import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { BarepaneApi, ConnectPayload, TransferProgress } from '../../shared/types'
import type { UpdateState } from '../../shared/updates'

const api: BarepaneApi = {
  connect: (payload: ConnectPayload) => ipcRenderer.invoke('ssh:connect', payload),
  disconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),
  listDir: (sessionId: string, dirPath: string) => ipcRenderer.invoke('ssh:list', sessionId, dirPath),
  stat: (sessionId: string, filePath: string) => ipcRenderer.invoke('ssh:stat', sessionId, filePath),
  readFile: (sessionId: string, filePath: string) => ipcRenderer.invoke('ssh:read-file', sessionId, filePath),
  writeFile: (sessionId: string, filePath: string, content: string, sudoPassword?: string) =>
    ipcRenderer.invoke('ssh:write-file', sessionId, filePath, content, sudoPassword),
  mkdir: (sessionId: string, dirPath: string, sudoPassword?: string) => ipcRenderer.invoke('ssh:mkdir', sessionId, dirPath, sudoPassword),
  rename: (sessionId: string, fromPath: string, toPath: string, sudoPassword?: string) =>
    ipcRenderer.invoke('ssh:rename', sessionId, fromPath, toPath, sudoPassword),
  remove: (sessionId: string, targetPath: string, sudoPassword?: string) => ipcRenderer.invoke('ssh:remove', sessionId, targetPath, sudoPassword),
  search: (sessionId, dirPath, query, options) => ipcRenderer.invoke('ssh:search', sessionId, dirPath, query, options),
  grep: (sessionId, dirPath, query, options) => ipcRenderer.invoke('ssh:grep', sessionId, dirPath, query, options),
  downloadFile: (sessionId: string, remotePath: string, localPath: string) =>
    ipcRenderer.invoke('ssh:download', sessionId, remotePath, localPath),
  uploadFile: (sessionId: string, localPath: string, remotePath: string, sudoPassword?: string) =>
    ipcRenderer.invoke('ssh:upload', sessionId, localPath, remotePath, sudoPassword),
  runSiteAction: (sessionId, action, sudoPassword) => ipcRenderer.invoke('ssh:site-action', sessionId, action, sudoPassword),
  chmod: (sessionId: string, targetPath: string, mode: string, sudoPassword?: string) =>
    ipcRenderer.invoke('ssh:chmod', sessionId, targetPath, mode, sudoPassword),
  pickSavePath: (defaultName: string) => ipcRenderer.invoke('dialog:save', defaultName),
  pickDirectory: () => ipcRenderer.invoke('dialog:directory'),
  pickOpenFiles: () => ipcRenderer.invoke('dialog:open'),
  pickPrivateKey: () => ipcRenderer.invoke('dialog:private-key'),
  readSshConfig: () => ipcRenderer.invoke('ssh:read-config'),
  cancelTransfer: (sessionId, transferId) => ipcRenderer.invoke('ssh:transfer-cancel', sessionId, transferId),
  saveLocalText: (defaultName, content) => ipcRenderer.invoke('dialog:save-text', defaultName, content),
  openLocalText: () => ipcRenderer.invoke('dialog:open-text'),
  listDefaultKeys: () => ipcRenderer.invoke('ssh:default-keys'),
  hasSshAgent: () => ipcRenderer.invoke('ssh:has-agent'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getStats: (sessionId: string) => ipcRenderer.invoke('ssh:stats', sessionId),
  getHealth: (sessionId: string) => ipcRenderer.invoke('ssh:health', sessionId),
  getRuntime: (sessionId: string) => ipcRenderer.invoke('ssh:runtime', sessionId),
  getSecurity: (sessionId: string) => ipcRenderer.invoke('ssh:security', sessionId),
  controlPm2: (sessionId, name, action) => ipcRenderer.invoke('ssh:pm2-control', sessionId, name, action),
  controlCompose: (sessionId, name, action, configFile) =>
    ipcRenderer.invoke('ssh:compose-control', sessionId, name, action, configFile),
  openLocalUrl: (url) => ipcRenderer.invoke('shell:open-local', url),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getUpdateState: () => ipcRenderer.invoke('app:update-state'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  setAutoCheckUpdates: (enabled) => ipcRenderer.invoke('app:set-auto-check', enabled),
  openExternalLink: (id) => ipcRenderer.invoke('app:open-link', id),
  onUpdateState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, next: UpdateState) => callback(next)
    ipcRenderer.on('app:update-state-changed', listener)
    return () => ipcRenderer.removeListener('app:update-state-changed', listener)
  },
  openShell: (sessionId: string) => ipcRenderer.invoke('ssh:open-shell', sessionId),
  closeShell: (sessionId: string, shellId: string) => ipcRenderer.invoke('ssh:close-shell', sessionId, shellId),
  listShells: (sessionId: string) => ipcRenderer.invoke('ssh:list-shells', sessionId),
  writeTerminal: (sessionId: string, shellId: string, data: string) =>
    ipcRenderer.send('ssh:terminal-input', sessionId, shellId, data),
  writeAllTerminals: (sessionId: string, data: string) => ipcRenderer.send('ssh:terminal-input-all', sessionId, data),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  resizeTerminal: (sessionId: string, shellId: string, cols: number, rows: number) => {
    ipcRenderer.send('ssh:terminal-resize', sessionId, shellId, { cols, rows })
  },
  readyTerminal: (sessionId: string, shellId: string) => ipcRenderer.send('ssh:terminal-ready', sessionId, shellId),
  openTunnel: (sessionId: string, draft) => ipcRenderer.invoke('ssh:tunnel-open', sessionId, draft),
  closeTunnel: (sessionId: string, tunnelId: string) => ipcRenderer.invoke('ssh:tunnel-close', sessionId, tunnelId),
  listTunnels: (sessionId: string) => ipcRenderer.invoke('ssh:tunnel-list', sessionId),
  openLog: (sessionId: string, draft, sudoPassword?: string) => ipcRenderer.invoke('ssh:log-open', sessionId, draft, sudoPassword),
  closeLog: (sessionId: string, logId: string) => ipcRenderer.invoke('ssh:log-close', sessionId, logId),
  listLogs: (sessionId: string) => ipcRenderer.invoke('ssh:log-list', sessionId),
  listUnits: (sessionId: string, sudoPassword?: string) => ipcRenderer.invoke('ssh:units-list', sessionId, sudoPassword),
  controlUnit: (sessionId: string, unit: string, action, sudoPassword?: string) =>
    ipcRenderer.invoke('ssh:units-control', sessionId, unit, action, sudoPassword),
  listContainers: (sessionId: string, sudoPassword?: string) => ipcRenderer.invoke('ssh:containers-list', sessionId, sudoPassword),
  controlContainer: (sessionId: string, name: string, action, sudoPassword?: string) =>
    ipcRenderer.invoke('ssh:containers-control', sessionId, name, action, sudoPassword),
  onTerminalData: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, shellId: string, data: string) =>
      callback(sessionId, shellId, data)
    ipcRenderer.on('ssh:terminal-data', listener)
    return () => ipcRenderer.removeListener('ssh:terminal-data', listener)
  },
  onLogData: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, logId: string, data: string) =>
      callback(sessionId, logId, data)
    ipcRenderer.on('ssh:log-data', listener)
    return () => ipcRenderer.removeListener('ssh:log-data', listener)
  },
  onLogClosed: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, logId: string, reason: string) =>
      callback(sessionId, logId, reason)
    ipcRenderer.on('ssh:log-closed', listener)
    return () => ipcRenderer.removeListener('ssh:log-closed', listener)
  },
  onDisconnected: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, reason: string) => callback(sessionId, reason)
    ipcRenderer.on('ssh:disconnected', listener)
    return () => ipcRenderer.removeListener('ssh:disconnected', listener)
  },
  onTransfer: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string, transfer: TransferProgress) =>
      callback(sessionId, transfer)
    ipcRenderer.on('ssh:transfer', listener)
    return () => ipcRenderer.removeListener('ssh:transfer', listener)
  },
}

contextBridge.exposeInMainWorld('barepane', api)
