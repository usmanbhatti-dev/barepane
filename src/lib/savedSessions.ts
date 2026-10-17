import {
  LAST_CONNECTION_KEY,
  SESSIONS_KEY,
  deleteSavedSession as removeFromList,
  parseSavedSession,
  parseSavedSessions,
  upsertSavedSession as upsertInList,
} from '@shared/sessions'
import type { SavedSession } from '@shared/types'
import { readJson } from './local'

function migrateLastConnection(list: SavedSession[]): SavedSession[] {
  if (list.length) return list
  const last = readJson(LAST_CONNECTION_KEY)
  const parsed = parseSavedSession(last)
  return parsed ? [parsed] : list
}

export function loadSavedSessions(): SavedSession[] {
  return migrateLastConnection(parseSavedSessions(readJson(SESSIONS_KEY)))
}

export function saveSavedSessions(list: SavedSession[]): SavedSession[] {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(list))
  return list
}

export function upsertSavedSession(next: SavedSession): SavedSession[] {
  const list = upsertInList(loadSavedSessions(), next)
  saveSavedSessions(list)
  return list
}

export function deleteSavedSession(id: string): SavedSession[] {
  const list = removeFromList(loadSavedSessions(), id)
  saveSavedSessions(list)
  return list
}
