import type { BarepaneApi } from '../shared/types'

declare global {
  interface Window {
    barepane: BarepaneApi
  }
}

export {}
