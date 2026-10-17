import { app, BrowserWindow, dialog, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { APP_NAME } from '../../shared/brand'
import { externalLinkUrl } from '../../shared/links'
import {
  friendlyUpdateError,
  INITIAL_UPDATE_STATE,
  shouldAutoCheck,
  type AppInfo,
  type UpdateState,
} from '../../shared/updates'

// electron-updater is CommonJS; the default import is the portable way to reach it from ESM.
const { autoUpdater } = electronUpdater

const FIRST_CHECK_DELAY_MS = 20_000
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000

type Settings = { autoCheckUpdates: boolean }
const DEFAULT_SETTINGS: Settings = { autoCheckUpdates: true }

let settings: Settings = { ...DEFAULT_SETTINGS }
let state: UpdateState = INITIAL_UPDATE_STATE
let publish: (next: UpdateState) => void = () => {}
let countSessions: () => number = () => 0
let timers: NodeJS.Timeout[] = []

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings(): Settings {
  try {
    const file = settingsFile()
    if (!existsSync(file)) return { ...DEFAULT_SETTINGS }
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Settings>
    return { autoCheckUpdates: raw.autoCheckUpdates !== false }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(): void {
  try {
    mkdirSync(path.dirname(settingsFile()), { recursive: true })
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8')
  } catch {
    // preference is best-effort; the app keeps working
  }
}

/** Why this install cannot update itself, or null when it can. */
function unsupportedReason(): string | null {
  if (process.env.BAREPANE_DISABLE_UPDATES === '1') return 'Automatic updates are turned off by BAREPANE_DISABLE_UPDATES.'
  if (!app.isPackaged) return 'Updates are only checked in installed builds, not in development.'
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return 'Automatic updates need the AppImage. Download new versions from the releases page.'
  }
  return null
}

function set(next: UpdateState): void {
  state = { ...next, checkedAt: next.checkedAt ?? state.checkedAt }
  publish(state)
}

function fail(error: unknown): void {
  // First line only: the raw message can include whole HTTP responses.
  const raw = error instanceof Error ? error.message : String(error)
  console.warn('[updater]', raw.split('\n')[0]?.slice(0, 200))
  if (state.userInitiated) {
    // Keep the version so the banner can tell a failed download from a failed check.
    set({ status: 'error', message: friendlyUpdateError(error), userInitiated: true, version: state.version })
  } else {
    // A failed background check must never interrupt someone who is mid-session.
    set({ status: 'idle' })
  }
}

export function getAppInfo(): AppInfo {
  return {
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    packaged: app.isPackaged,
    autoCheckUpdates: settings.autoCheckUpdates,
  }
}

export function getUpdateState(): UpdateState {
  return state
}

export function setAutoCheckUpdates(enabled: boolean): AppInfo {
  settings = { ...settings, autoCheckUpdates: enabled === true }
  saveSettings()
  return getAppInfo()
}

export async function checkForUpdates(userInitiated: boolean): Promise<UpdateState> {
  const reason = unsupportedReason()
  if (reason) {
    set({ status: 'unsupported', message: reason, userInitiated })
    return state
  }
  // Do not stack requests, and do not discard an update that is already announced or downloaded.
  if (
    state.status === 'checking' ||
    state.status === 'available' ||
    state.status === 'downloading' ||
    state.status === 'ready'
  ) {
    return state
  }
  set({ status: 'checking', userInitiated })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    fail(error)
  }
  return state
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (state.status !== 'available') return state
  set({ ...state, status: 'downloading', percent: 0, userInitiated: true })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    fail(error)
  }
  return state
}

export async function installUpdate(): Promise<void> {
  if (state.status !== 'ready') return
  const open = countSessions()
  if (open > 0) {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined
    const options = {
      type: 'warning' as const,
      buttons: ['Restart and update', 'Not now'],
      defaultId: 1,
      cancelId: 1,
      title: `Update ${APP_NAME}`,
      message: `Restart ${APP_NAME} to install version ${state.version ?? ''}?`.replace('  ', ' '),
      detail: `You have ${open} open SSH ${open === 1 ? 'session' : 'sessions'}. Restarting closes them, and any unsaved editor changes are lost.`,
    }
    const choice = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
    if (choice.response !== 0) return
  }
  autoUpdater.quitAndInstall(false, true)
}

/** "Check for Updates…" from the menu: always tell the person what happened. */
export async function checkFromMenu(): Promise<void> {
  const result = await checkForUpdates(true)
  const parent = BrowserWindow.getFocusedWindow() ?? undefined
  const show = (message: string, detail?: string) => {
    const options = { type: 'info' as const, buttons: ['OK'], title: APP_NAME, message, detail }
    return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
  }
  if (result.status === 'none') {
    await show(`You are on the latest version (${app.getVersion()}).`)
  } else if (result.status === 'unsupported' || result.status === 'error') {
    await show('Could not check for updates.', result.message)
  }
  // available / downloading / ready are shown by the in-app banner.
}

export function openExternalLink(id: unknown): Promise<void> {
  return shell.openExternal(externalLinkUrl(id))
}

export function initUpdater(options: { onState: (next: UpdateState) => void; sessionCount: () => number }): void {
  publish = options.onState
  countSessions = options.sessionCount
  settings = loadSettings()

  const reason = unsupportedReason()
  if (reason) {
    state = { status: 'unsupported', message: reason }
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true
  // Beta testers stay on the beta channel; stable users never get prereleases.
  autoUpdater.allowPrerelease = app.getVersion().includes('-')

  autoUpdater.on('checking-for-update', () => set({ ...state, status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    set({ status: 'available', version: info.version, userInitiated: state.userInitiated, checkedAt: Date.now() }),
  )
  autoUpdater.on('update-not-available', () => set({ status: 'none', userInitiated: state.userInitiated, checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (progress: ProgressInfo) =>
    set({ status: 'downloading', version: state.version, percent: progress.percent, userInitiated: true }),
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
    set({ status: 'ready', version: info.version, userInitiated: true, checkedAt: state.checkedAt }),
  )
  autoUpdater.on('error', (error: Error) => fail(error))

  const runBackgroundCheck = () => {
    const busy = state.status === 'checking' || state.status === 'downloading'
    if (shouldAutoCheck({ enabled: settings.autoCheckUpdates, supported: true, busy })) {
      void checkForUpdates(false)
    }
  }
  timers = [setTimeout(runBackgroundCheck, FIRST_CHECK_DELAY_MS), setInterval(runBackgroundCheck, CHECK_INTERVAL_MS)]
  for (const timer of timers) timer.unref()
}

export function stopUpdater(): void {
  for (const timer of timers) clearTimeout(timer)
  timers = []
}
