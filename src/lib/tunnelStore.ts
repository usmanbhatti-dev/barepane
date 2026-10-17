import { tunnelsKey } from '@shared/storage'
import { parseTunnelDrafts } from '@shared/tunnels'
import type { TunnelDraft } from '@shared/types'

export function loadTunnelRecipes(scope: string): TunnelDraft[] {
  try {
    const raw = localStorage.getItem(tunnelsKey(scope))
    return raw ? parseTunnelDrafts(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function saveTunnelRecipes(scope: string, list: TunnelDraft[]): void {
  localStorage.setItem(tunnelsKey(scope), JSON.stringify(list))
}
