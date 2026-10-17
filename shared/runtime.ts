import { shellQuote } from './paths.ts'
import type { ComposeAction, ComposeProject, ListenPort, Pm2App, RuntimeSnapshot, RuntimeStack, SiteVhost } from './types.ts'

export const MAX_PORTS = 32
export const MAX_STACKS = 16
export const MAX_PM2 = 20
export const MAX_COMPOSE = 12
export const MAX_VHOSTS = 12
export const MAX_RESTARTING = 12

const PM2_NAME = /^[A-Za-z0-9._:-]{1,64}$/
const COMPOSE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const COMPOSE_FILE_SAFE = /^\/[A-Za-z0-9._\-/]+$/
export const PM2_ACTIONS = ['restart', 'start', 'stop'] as const
export const COMPOSE_ACTIONS = ['up', 'down', 'restart'] as const
export type Pm2Action = (typeof PM2_ACTIONS)[number]
export type { ComposeAction }

export type DashboardHint = {
  id: 'grafana' | 'prometheus' | 'node_exporter'
  label: string
  port: number
  open: boolean
}

/** One short SSH exec. Caps and no filesystem walks so the shell stays usable. */
export const RUNTIME_SCRIPT = [
  'echo BEGIN_LISTEN',
  'ss -lntH 2>/dev/null | awk \'{print $4}\' | head -n 32',
  'echo END_LISTEN',
  'echo BEGIN_PROCS',
  "ps -eo comm= 2>/dev/null | awk '$0==\"nginx\"||$0==\"caddy\"||$0==\"apache2\"||$0==\"httpd\"{print \"web\\t\"$0} $0==\"node\"||$0==\"nodejs\"{print \"node\\t\"$0} $0==\"python\"||$0==\"python3\"||$0==\"gunicorn\"||$0==\"uvicorn\"{print \"python\\t\"$0} $0 ~ /^php-fpm/{print \"php\\t\"$0} $0==\"java\"{print \"java\\t\"$0} $0==\"pm2\"||$0==\"PM2\"{print \"pm2\\t\"$0} $0==\"dockerd\"{print \"docker\\t\"$0}' | sort | uniq -c | awk '{printf \"%s\\t%s\\t%s\\n\", $2, $3, $1}' | head -n 16",
  'echo END_PROCS',
  'echo BEGIN_PM2',
  'if command -v pm2 >/dev/null 2>&1; then pm2 jlist 2>/dev/null | head -c 60000; else echo MISSING; fi',
  'echo',
  'echo END_PM2',
  'echo BEGIN_COMPOSE',
  "docker compose ls --format json 2>/dev/null | head -c 16000 || echo '[]'",
  'echo',
  'echo END_COMPOSE',
  'echo BEGIN_RESTARTING',
  "docker ps --filter status=restarting --format '{{.Names}}' 2>/dev/null | head -n 12",
  'echo END_RESTARTING',
  'echo BEGIN_VHOSTS',
  'i=0; for f in /etc/nginx/sites-enabled/*; do [ -e "$f" ] || continue; i=$((i+1)); [ "$i" -gt 12 ] && break; awk -v file="$f" \'$1=="server_name" { gsub(/;/, "", $2); name=$2 } $1=="root" { gsub(/;/, "", $2); root=$2 } $1=="proxy_pass" { gsub(/;/, "", $2); proxy=$2 } END { printf "%s\\t%s\\t%s\\t%s\\n", file, name, root, proxy }\' "$f" 2>/dev/null; done',
  'echo END_VHOSTS',
].join('; ')

function block(raw: string, start: string, end: string): string[] {
  const lines = raw.split('\n')
  const from = lines.findIndex((line) => line.trim() === start)
  const to = lines.findIndex((line) => line.trim() === end)
  if (from === -1 || to === -1 || to <= from) return []
  return lines.slice(from + 1, to).map((line) => line.trim()).filter(Boolean)
}

export function parseListenAddress(raw: string): ListenPort | null {
  const value = raw.trim()
  if (!value) return null
  const match = value.match(/^(.*):(\d+)$/)
  if (!match) return null
  const address = match[1].replace(/^\[|\]$/g, '')
  const port = Number(match[2])
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  const loopback = address === '127.0.0.1' || address === '::1' || address === 'localhost'
  return { address: address || '*', port, public: !loopback }
}

function parseStacks(raw: string): RuntimeStack[] {
  const stacks: RuntimeStack[] = []
  for (const line of block(raw, 'BEGIN_PROCS', 'END_PROCS')) {
    const [kind, name, countRaw] = line.split('\t')
    if (!kind || !name) continue
    const count = Number(countRaw)
    if (!Number.isFinite(count) || count < 1) continue
    if (!['node', 'python', 'php', 'web', 'java', 'pm2', 'docker'].includes(kind)) continue
    stacks.push({ kind: kind as RuntimeStack['kind'], name, count })
    if (stacks.length >= MAX_STACKS) break
  }
  return stacks
}

function parsePorts(raw: string): ListenPort[] {
  const ports: ListenPort[] = []
  const seen = new Set<string>()
  for (const line of block(raw, 'BEGIN_LISTEN', 'END_LISTEN')) {
    const parsed = parseListenAddress(line)
    if (!parsed) continue
    const key = `${parsed.address}:${parsed.port}`
    if (seen.has(key)) continue
    seen.add(key)
    ports.push(parsed)
    if (ports.length >= MAX_PORTS) break
  }
  return ports
}

function parsePm2(raw: string): { apps: Pm2App[]; missing: boolean } {
  const body = block(raw, 'BEGIN_PM2', 'END_PM2').join('\n').trim()
  if (!body || body === 'MISSING') return { apps: [], missing: body === 'MISSING' }
  try {
    const data = JSON.parse(body) as unknown
    if (!Array.isArray(data)) return { apps: [], missing: false }
    const apps: Pm2App[] = []
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const env = row.pm2_env && typeof row.pm2_env === 'object' ? (row.pm2_env as Record<string, unknown>) : {}
      const name = typeof row.name === 'string' ? row.name.trim() : typeof env.name === 'string' ? env.name.trim() : ''
      if (!name || !PM2_NAME.test(name)) continue
      const outLog = typeof env.pm_out_log_path === 'string' ? env.pm_out_log_path : undefined
      apps.push({
        name,
        status: typeof env.status === 'string' ? env.status : 'unknown',
        pid: typeof row.pid === 'number' ? row.pid : 0,
        restarts: typeof env.restart_time === 'number' ? env.restart_time : 0,
        outLog,
      })
      if (apps.length >= MAX_PM2) break
    }
    return { apps, missing: false }
  } catch {
    return { apps: [], missing: false }
  }
}

function parseCompose(raw: string): ComposeProject[] {
  const body = block(raw, 'BEGIN_COMPOSE', 'END_COMPOSE').join('\n').trim() || '[]'
  try {
    const data = JSON.parse(body) as unknown
    const list = Array.isArray(data) ? data : []
    const projects: ComposeProject[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const name = typeof row.Name === 'string' ? row.Name.trim() : ''
      if (!name || !COMPOSE_NAME.test(name)) continue
      const configFile = firstComposeFile(row.ConfigFiles)
      projects.push({
        name,
        status: typeof row.Status === 'string' ? row.Status : '',
        ...(configFile ? { configFile } : {}),
      })
      if (projects.length >= MAX_COMPOSE) break
    }
    return projects
  } catch {
    return []
  }
}

function parseVhosts(raw: string): SiteVhost[] {
  const vhosts: SiteVhost[] = []
  for (const line of block(raw, 'BEGIN_VHOSTS', 'END_VHOSTS')) {
    const [file, serverName = '', root = '', proxy = ''] = line.split('\t')
    if (!file || file.includes('\0')) continue
    const kind = proxy ? 'proxy' : root ? 'static' : 'unknown'
    vhosts.push({
      file,
      serverName: serverName.replace(/["']/g, ''),
      root: root.replace(/["']/g, ''),
      proxy: proxy.replace(/["']/g, ''),
      kind,
    })
    if (vhosts.length >= MAX_VHOSTS) break
  }
  return vhosts
}

function firstComposeFile(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const first = raw.split(',')[0]?.trim() || ''
  try {
    return parseComposeFile(first)
  } catch {
    return undefined
  }
}

function parseRestarting(raw: string): string[] {
  const names: string[] = []
  for (const line of block(raw, 'BEGIN_RESTARTING', 'END_RESTARTING')) {
    const name = line.trim()
    if (!name || name.length > 128 || /[;&|`$<>]/.test(name)) continue
    names.push(name)
    if (names.length >= MAX_RESTARTING) break
  }
  return names
}

export function parseRuntime(raw: string): RuntimeSnapshot {
  const pm2 = parsePm2(raw)
  return {
    stacks: parseStacks(raw),
    ports: parsePorts(raw),
    pm2: pm2.apps,
    pm2Missing: pm2.missing,
    compose: parseCompose(raw),
    restarting: parseRestarting(raw),
    vhosts: parseVhosts(raw),
  }
}

export function parsePm2Name(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name || !PM2_NAME.test(name)) throw new Error('PM2 process name is not valid.')
  return name
}

export function parseComposeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name || !COMPOSE_NAME.test(name)) throw new Error('Compose project name is not valid.')
  return name
}

export function parsePm2Action(raw: unknown): Pm2Action {
  if (typeof raw === 'string' && (PM2_ACTIONS as readonly string[]).includes(raw)) return raw as Pm2Action
  throw new Error('Choose start, stop, or restart.')
}

export function parseComposeAction(raw: unknown): ComposeAction {
  if (typeof raw === 'string' && (COMPOSE_ACTIONS as readonly string[]).includes(raw)) return raw as ComposeAction
  throw new Error('Choose up, down, or restart.')
}

export function parseComposeFile(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return undefined
  if (!COMPOSE_FILE_SAFE.test(value) || value.includes('//') || value.includes('..')) {
    throw new Error('Compose file path is not valid.')
  }
  return value
}

export function buildPm2Command(action: Pm2Action, name: string): string {
  return `pm2 ${parsePm2Action(action)} ${shellQuote(parsePm2Name(name))}`
}

export function buildComposeCommand(action: ComposeAction, name: string, configFile?: string): string {
  const project = parseComposeName(name)
  const parsed = parseComposeAction(action)
  const file = parseComposeFile(configFile)
  if ((parsed === 'up' || parsed === 'down') && !file) {
    throw new Error('Compose file path is required for up and down.')
  }
  const fileFlag = file ? `-f ${shellQuote(file)} ` : ''
  if (parsed === 'up') return `docker compose ${fileFlag}-p ${shellQuote(project)} up -d`
  if (parsed === 'down') return `docker compose ${fileFlag}-p ${shellQuote(project)} down`
  return `docker compose ${fileFlag}-p ${shellQuote(project)} restart`
}

export function buildComposeRestartCommand(name: string, configFile?: string): string {
  return buildComposeCommand('restart', name, configFile)
}

export function dashboardHint(port: number): DashboardHint | null {
  if (port === 3000) return { id: 'grafana', label: 'Grafana (typical)', port, open: true }
  if (port === 9090) return { id: 'prometheus', label: 'Prometheus (typical)', port, open: true }
  if (port === 9100) return { id: 'node_exporter', label: 'node_exporter', port, open: false }
  return null
}

export function uniqueDashboards(ports: ListenPort[]): DashboardHint[] {
  const seen = new Set<number>()
  const list: DashboardHint[] = []
  for (const item of ports) {
    const hint = dashboardHint(item.port)
    if (!hint || seen.has(hint.port)) continue
    seen.add(hint.port)
    list.push(hint)
  }
  return list
}

export function stackLabel(kind: RuntimeStack['kind']): string {
  if (kind === 'node') return 'Node.js'
  if (kind === 'python') return 'Python'
  if (kind === 'php') return 'PHP'
  if (kind === 'web') return 'Web server'
  if (kind === 'java') return 'Java'
  if (kind === 'pm2') return 'PM2'
  return 'Docker'
}
