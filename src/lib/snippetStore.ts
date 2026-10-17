import {
  DEFAULT_SNIPPETS,
  SNIPPETS_KEY,
  deleteSnippet as removeFromList,
  parseSnippets,
  upsertSnippet as upsertInList,
  type CommandSnippet,
} from '@shared/snippets'
import { readJson } from './local'

export function loadSnippets(): CommandSnippet[] {
  const raw = localStorage.getItem(SNIPPETS_KEY)
  if (raw === null) {
    localStorage.setItem(SNIPPETS_KEY, JSON.stringify(DEFAULT_SNIPPETS))
    return DEFAULT_SNIPPETS
  }
  return parseSnippets(readJson(SNIPPETS_KEY))
}

export function saveSnippets(list: CommandSnippet[]): void {
  localStorage.setItem(SNIPPETS_KEY, JSON.stringify(list))
}

export function upsertSnippet(next: CommandSnippet): CommandSnippet[] {
  const list = upsertInList(loadSnippets(), next)
  saveSnippets(list)
  return list
}

export function deleteSnippet(id: string): CommandSnippet[] {
  const list = removeFromList(loadSnippets(), id)
  saveSnippets(list)
  return list
}
