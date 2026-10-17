import { shellQuote } from './paths.ts'
import type { ContainerAction, DockerContainer, ServiceAction, ServiceUnit } from './types'

export const MAX_UNITS = 250
export const MAX_CONTAINERS = 100

export const SERVICE_ACTIONS: ServiceAction[] = ['start', 'stop', 'restart', 'enable', 'disable']
export const CONTAINER_ACTIONS: ContainerAction[] = ['start', 'stop', 'restart']

const UNIT_RE = /^[A-Za-z0-9:._@\\*-]{1,256}$/
const CONTAINER_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export function parseUnitName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name || !UNIT_RE.test(name)) {
    throw new Error('Unit name can only contain letters, numbers, and :._@*-')
  }
  return name
}

export function parseContainerName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name || !CONTAINER_RE.test(name)) {
    throw new Error('Container name can only contain letters, numbers, underscore, dot, and dash.')
  }
  return name
}

export function parseServiceAction(raw: unknown): ServiceAction {
  if (typeof raw === 'string' && SERVICE_ACTIONS.includes(raw as ServiceAction)) return raw as ServiceAction
  throw new Error('Choose start, stop, restart, enable, or disable.')
}

export function parseContainerAction(raw: unknown): ContainerAction {
  if (typeof raw === 'string' && CONTAINER_ACTIONS.includes(raw as ContainerAction)) return raw as ContainerAction
  throw new Error('Choose start, stop, or restart.')
}

export function buildUnitListCommand(): string {
  return 'systemctl list-units --type=service --all --no-pager --plain --no-legend --full'
}

export function buildContainerListCommand(): string {
  return `docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'`
}

export function buildUnitCommand(action: ServiceAction, unit: string): string {
  return `systemctl ${parseServiceAction(action)} ${shellQuote(parseUnitName(unit))}`
}

export function buildContainerCommand(action: ContainerAction, name: string): string {
  return `docker ${parseContainerAction(action)} ${shellQuote(parseContainerName(name))}`
}

export function parseSystemctlList(raw: string): ServiceUnit[] {
  const units: ServiceUnit[] = []
  const seen = new Set<string>()
  for (const line of raw.split('\n')) {
    const cleaned = line.replace(/^[●○]\s*/, '').trim()
    if (!cleaned) continue
    if (/loaded units listed/i.test(cleaned) || /^UNIT\s+LOAD\s+ACTIVE/i.test(cleaned)) continue
    const match = cleaned.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/)
    if (!match) continue
    const name = match[1]
    if (!name || seen.has(name) || !UNIT_RE.test(name)) continue
    seen.add(name)
    units.push({
      name,
      load: match[2],
      active: match[3],
      sub: match[4],
      description: match[5].trim(),
    })
    if (units.length >= MAX_UNITS) break
  }
  return units
}

export function parseDockerPs(raw: string): DockerContainer[] {
  const list: DockerContainer[] = []
  const seen = new Set<string>()
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.toLowerCase().startsWith('error') || trimmed.toLowerCase().startsWith('permission')) continue
    const parts = trimmed.split('\t')
    if (parts.length < 4) continue
    const id = (parts[0] || '').slice(0, 12)
    const name = (parts[1] || '').split(',')[0]?.trim() || ''
    if (!id || !name || seen.has(name) || !CONTAINER_RE.test(name)) continue
    seen.add(name)
    list.push({
      id,
      name,
      image: parts[2] || '',
      status: parts[3] || '',
      ports: parts.slice(4).join('\t'),
    })
    if (list.length >= MAX_CONTAINERS) break
  }
  return list
}

export function looksMissingDocker(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('command not found') || lower.includes('no such file') || /\bdocker:\s*not found\b/.test(lower)
}

export function looksDockerDaemonDown(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('cannot connect to the docker daemon') || lower.includes('is the docker daemon running')
}

export function looksServicePermission(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('permission denied') ||
    lower.includes('interactive authentication required') ||
    lower.includes('authentication is required') ||
    lower.includes('access denied') ||
    lower.includes('must be root') ||
    lower.includes('a password is required')
  )
}
