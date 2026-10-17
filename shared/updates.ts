export type UpdateStatus =
  | 'unsupported' // dev build, or an install type that cannot self-update
  | 'idle' // nothing known yet
  | 'checking'
  | 'none' // checked: already on the latest version
  | 'available' // newer version found, not downloaded
  | 'downloading'
  | 'ready' // downloaded, waiting for a restart
  | 'error'

export type UpdateState = {
  status: UpdateStatus
  /** Version offered by the update feed (available, downloading, ready). */
  version?: string
  /** Download progress, 0-100. */
  percent?: number
  /** Friendly message for the error state or the unsupported reason. */
  message?: string
  /** True when the user triggered the last action (so errors should be shown). */
  userInitiated?: boolean
  /** Epoch ms of the last completed check. */
  checkedAt?: number
}

export type AppInfo = {
  name: string
  version: string
  platform: string
  arch: string
  electron: string
  packaged: boolean
  autoCheckUpdates: boolean
}

export const INITIAL_UPDATE_STATE: UpdateState = { status: 'idle' }

/** Turn a low-level updater error into something a person can act on. */
export function friendlyUpdateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const lower = raw.toLowerCase()
  if (
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('err_internet_disconnected') ||
    lower.includes('err_network') ||
    lower.includes('net::') ||
    lower.includes('getaddrinfo')
  ) {
    return 'Could not reach the update server. Check your internet connection and try again.'
  }
  if (lower.includes('404') || lower.includes('no published versions') || lower.includes('cannot find latest')) {
    return 'No update information is published yet. Check the releases page.'
  }
  if (lower.includes('403') || lower.includes('rate limit')) {
    return 'The update server is rate-limiting requests. Try again in a few minutes.'
  }
  if (lower.includes('code signature') || lower.includes('signature') || lower.includes('not signed')) {
    return 'This build could not verify the update. Download the new version from the releases page.'
  }
  if (lower.includes('sha512') || lower.includes('checksum')) {
    return 'The downloaded update failed its integrity check, so it was discarded. Try again, or download from the releases page.'
  }
  return 'Could not update automatically. You can download the latest version from the releases page.'
}

/** One line for the About panel. */
export function describeUpdate(state: UpdateState): string {
  switch (state.status) {
    case 'unsupported':
      return state.message || 'Automatic updates are not available for this install.'
    case 'checking':
      return 'Checking for updates…'
    case 'none':
      return 'You are on the latest version.'
    case 'available':
      return `Version ${state.version ?? ''} is available.`.replace('  ', ' ')
    case 'downloading':
      return `Downloading version ${state.version ?? ''}… ${Math.round(state.percent ?? 0)}%`.replace('  ', ' ')
    case 'ready':
      return `Version ${state.version ?? ''} is ready. Restart Barepane to finish updating.`.replace('  ', ' ')
    case 'error':
      return state.message || 'Could not check for updates.'
    default:
      return 'Updates are checked in the background.'
  }
}

/** Whether a background check should run now. */
export function shouldAutoCheck(options: { enabled: boolean; supported: boolean; busy: boolean }): boolean {
  return options.enabled && options.supported && !options.busy
}

/**
 * The banner only interrupts for things the user can act on. A failed *check* is reported where the
 * user asked for it (About panel or menu dialog); the banner only reports a failed *download*.
 */
export function shouldShowBanner(state: UpdateState): boolean {
  if (state.status === 'available' || state.status === 'downloading' || state.status === 'ready') return true
  return state.status === 'error' && Boolean(state.userInitiated) && Boolean(state.version)
}
