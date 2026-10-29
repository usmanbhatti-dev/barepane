import { shellQuote } from './paths.ts'
import type {
  ContainerAction,
  DockerContainer,
  DockerImage,
  DockerInspect,
  DockerInventory,
  DockerVolume,
  ServiceAction,
  ServiceUnit,
} from './types'

export const MAX_UNITS = 250
export const MAX_CONTAINERS = 100
export const MAX_IMAGES = 80
export const MAX_VOLUMES = 80

export const SERVICE_ACTIONS: ServiceAction[] = ['start', 'stop', 'restart', 'enable', 'disable']
export const CONTAINER_ACTIONS: ContainerAction[] = ['start', 'stop', 'restart']

const UNIT_RE = /^[A-Za-z0-9:._@\\*-]{1,256}$/
const CONTAINER_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const VOLUME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/
const IMAGE_ID_RE = /^[A-Fa-f0-9]{8,64}$/

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

/** One SSH exec. Lists only — no stats, no inspect. */
export const DOCKER_INVENTORY_SCRIPT = [
  'echo BEGIN_PS',
  `docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1 | head -n 100`,
  'echo END_PS',
  'echo BEGIN_IMAGES',
  `docker images --format '{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' 2>&1 | head -n 80`,
  'echo END_IMAGES',
  'echo BEGIN_VOLUMES',
  `docker volume ls --format '{{.Name}}\t{{.Driver}}\t{{.Mountpoint}}' 2>&1 | head -n 80`,
  'echo END_VOLUMES',
].join('; ')

export function buildContainerInspectCommand(name: string): string {
  const quoted = shellQuote(parseContainerName(name))
  return [
    'echo BEGIN_INSPECT',
    `docker inspect --format '{{.HostConfig.NanoCpus}}\t{{.HostConfig.Memory}}' ${quoted} 2>&1`,
    'echo END_INSPECT',
    'echo BEGIN_STATS',
    `docker stats --no-stream --no-trunc --format '{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' ${quoted} 2>&1`,
    'echo END_STATS',
  ].join('; ')
}

function block(raw: string, start: string, end: string): string[] {
  const lines = raw.split('\n')
  const from = lines.findIndex((line) => line.trim() === start)
  const to = lines.findIndex((line) => line.trim() === end)
  if (from === -1 || to === -1 || to <= from) return []
  return lines.slice(from + 1, to).map((line) => line.trim()).filter(Boolean)
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

export function parseDockerImages(raw: string): DockerImage[] {
  const list: DockerImage[] = []
  const seen = new Set<string>()
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.toLowerCase().startsWith('error') || trimmed.toLowerCase().startsWith('permission')) continue
    const [idRaw, repository = '', tag = '', size = '', ...rest] = trimmed.split('\t')
    const id = (idRaw || '').replace(/^sha256:/, '').slice(0, 12)
    if (!id || !IMAGE_ID_RE.test(id)) continue
    const key = `${id}:${repository}:${tag}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push({
      id,
      repository: repository.slice(0, 180) || '<none>',
      tag: tag.slice(0, 64) || '<none>',
      size: size.slice(0, 32) || '—',
      created: rest.join('\t').slice(0, 64),
    })
    if (list.length >= MAX_IMAGES) break
  }
  return list
}

export function parseDockerVolumes(raw: string): DockerVolume[] {
  const list: DockerVolume[] = []
  const seen = new Set<string>()
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.toLowerCase().startsWith('error') || trimmed.toLowerCase().startsWith('permission')) continue
    const [name, driver = '', mountpoint = ''] = trimmed.split('\t')
    if (!name || !VOLUME_RE.test(name) || seen.has(name)) continue
    seen.add(name)
    list.push({
      name,
      driver: driver.slice(0, 32) || 'local',
      mountpoint: mountpoint.startsWith('/') ? mountpoint.slice(0, 256) : '',
    })
    if (list.length >= MAX_VOLUMES) break
  }
  return list
}

export function parseDockerInventory(raw: string): DockerInventory {
  if (looksMissingDocker(raw)) return { containers: [], images: [], volumes: [], missing: true }
  if (looksDockerDaemonDown(raw)) return { containers: [], images: [], volumes: [], daemon: true }
  const psBody = block(raw, 'BEGIN_PS', 'END_PS').join('\n')
  const imageBody = block(raw, 'BEGIN_IMAGES', 'END_IMAGES').join('\n')
  const volumeBody = block(raw, 'BEGIN_VOLUMES', 'END_VOLUMES').join('\n')
  return {
    containers: parseDockerPs(psBody || raw),
    images: parseDockerImages(imageBody),
    volumes: parseDockerVolumes(volumeBody),
  }
}

export function formatCpuLimit(nanoCpus: number): string {
  if (!(nanoCpus > 0)) return 'unlimited'
  const cpus = nanoCpus / 1e9
  return `${Number.isInteger(cpus) ? String(cpus) : cpus.toFixed(2)} CPU`
}

export function formatMemoryLimit(bytes: number): string {
  if (!(bytes > 0)) return 'unlimited'
  if (bytes >= 1073741824) {
    const gb = bytes / 1073741824
    return `${Number.isInteger(gb) ? String(gb) : gb.toFixed(1)} GB`
  }
  if (bytes >= 1048576) {
    const mb = bytes / 1048576
    return `${Number.isInteger(mb) ? String(mb) : mb.toFixed(1)} MB`
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function parseDockerInspect(raw: string, name: string): DockerInspect {
  const inspectLine = block(raw, 'BEGIN_INSPECT', 'END_INSPECT')[0] || ''
  const statsLine = block(raw, 'BEGIN_STATS', 'END_STATS')[0] || ''
  const [nanoRaw, memRaw] = inspectLine.split('\t')
  const nano = Number(nanoRaw)
  const memory = Number(memRaw)
  const [cpuPercent, memoryUsage, memoryPercent] = statsLine.split('\t')
  const statsOk = Boolean(cpuPercent && !/error|cannot|no such/i.test(statsLine))
  return {
    name: parseContainerName(name),
    cpuLimit: formatCpuLimit(Number.isFinite(nano) ? nano : 0),
    memoryLimit: formatMemoryLimit(Number.isFinite(memory) ? memory : 0),
    ...(statsOk
      ? {
          cpuPercent: cpuPercent.trim(),
          memoryUsage: (memoryUsage || '').trim() || undefined,
          memoryPercent: (memoryPercent || '').trim() || undefined,
        }
      : {}),
  }
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
