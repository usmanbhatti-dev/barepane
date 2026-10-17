import { APP_NAME } from '@shared/brand'
import type { BarepaneApi } from '@shared/types'

export function isDesktop(): boolean {
  return Boolean(window.barepane)
}

export function desktop(): BarepaneApi {
  if (!window.barepane) {
    throw new Error(`${APP_NAME} must run as the desktop app.`)
  }
  return window.barepane
}
