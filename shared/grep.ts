import { normalizePath, shellQuote } from './paths.ts'
import type { ContentHit } from './types.ts'

export const MAX_GREP_QUERY = 80
export const MAX_GREP_HITS = 200
export const MAX_GREP_DEPTH = 8
export const MAX_GREP_FILE_KB = 512

export function parseGrepQuery(raw: string): string {
  const query = raw.trim()
  if (!query) throw new Error('Enter text to search for.')
  if (query.length > MAX_GREP_QUERY) throw new Error('Search is too long.')
  if (query.includes('\0') || query.includes('\n')) throw new Error('Search cannot contain line breaks.')
  return query
}

export function buildGrepCommand(dirPath: string, query: string, options?: { maxDepth?: number; limit?: number }): string {
  const root = normalizePath(dirPath)
  const needle = parseGrepQuery(query)
  const depth = Number.isInteger(options?.maxDepth)
    ? Math.min(10, Math.max(1, options!.maxDepth!))
    : MAX_GREP_DEPTH
  const limit = Number.isInteger(options?.limit) ? Math.min(400, Math.max(1, options!.limit!)) : MAX_GREP_HITS
  return [
    `find ${shellQuote(root)} -maxdepth ${depth} -type f -size -${MAX_GREP_FILE_KB}k`,
    `! -path ${shellQuote('*/.git/*')} ! -path ${shellQuote('*/node_modules/*')} ! -path ${shellQuote('*/vendor/*')}`,
    `-exec grep -nIF --binary-files=without-match -m 2 -e ${shellQuote(needle)} {} +`,
    `2>/dev/null | head -n ${limit}`,
  ].join(' ')
}

export function parseGrepHits(raw: string): ContentHit[] {
  const hits: ContentHit[] = []
  const seen = new Set<string>()
  for (const line of raw.split('\n')) {
    const match = line.match(/^(.*?):(\d+):(.*)$/)
    if (!match) continue
    const foundPath = match[1].trim()
    const lineNo = Number(match[2])
    if (!foundPath.startsWith('/') || !Number.isInteger(lineNo) || lineNo < 1) continue
    const key = `${foundPath}:${lineNo}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = foundPath.split('/').filter(Boolean).at(-1) || foundPath
    hits.push({
      path: foundPath,
      name,
      line: lineNo,
      text: match[3].slice(0, 240),
    })
    if (hits.length >= MAX_GREP_HITS) break
  }
  return hits
}
