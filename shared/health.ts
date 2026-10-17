import type { DiskMount, HealthLevel, ServerStats, TopProcess } from './types.ts'

/** Cheap status-bar snapshot. Full process/disk/service detail is HEALTH_SCRIPT. */
export const STATS_SCRIPT = [
  'printf "HOST=%s\\n" "$(hostname 2>/dev/null || echo unknown)"',
  'printf "OS=%s\\n" "$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -s)"',
  'printf "KERNEL=%s\\n" "$(uname -r 2>/dev/null || echo unknown)"',
  'printf "UPTIME=%s\\n" "$(uptime -p 2>/dev/null || uptime 2>/dev/null || echo unknown)"',
  'printf "MEM=%s\\n" "$(free -m 2>/dev/null | awk \'/^Mem:/{printf "%s %s %s", $3, $2, $7}\' || echo \'0 0 0\')"',
  'printf "LOAD=%s\\n" "$(cut -d\' \' -f1-3 /proc/loadavg 2>/dev/null || echo \'0 0 0\')"',
  'printf "CPU=%s\\n" "$(nproc 2>/dev/null || echo 0)"',
  'printf "REBOOT=%s\\n" "$(test -f /var/run/reboot-required && echo yes || echo no)"',
  'echo BEGIN_DISKS',
  'df -hP / 2>/dev/null | awk \'NR==2 {gsub("%","",$5); printf "%s\\t%s\\t%s\\t%s\\t%s\\n", $6, $2, $3, $4, $5}\'',
  'echo END_DISKS',
].join('; ')

export const HEALTH_SCRIPT = [
  'printf "HOST=%s\\n" "$(hostname 2>/dev/null || echo unknown)"',
  'printf "OS=%s\\n" "$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -s)"',
  'printf "KERNEL=%s\\n" "$(uname -r 2>/dev/null || echo unknown)"',
  'printf "ARCH=%s\\n" "$(uname -m 2>/dev/null || echo unknown)"',
  'printf "VIRT=%s\\n" "$(systemd-detect-virt 2>/dev/null || echo unknown)"',
  'printf "UPTIME=%s\\n" "$(uptime -p 2>/dev/null || uptime 2>/dev/null || echo unknown)"',
  'printf "TIME=%s\\n" "$(date -u \'+%Y-%m-%d %H:%M UTC\' 2>/dev/null || date 2>/dev/null || echo unknown)"',
  'printf "IPS=%s\\n" "$(hostname -I 2>/dev/null | tr -s \' \' | sed \'s/[[:space:]]*$//\' || echo)"',
  'printf "CPU=%s\\n" "$(nproc 2>/dev/null || echo 0)"',
  'printf "CPU_MODEL=%s\\n" "$(awk -F: \'/model name/{gsub(/^ /,"",$2); print $2; exit}\' /proc/cpuinfo 2>/dev/null || echo unknown)"',
  'printf "LOAD=%s\\n" "$(cut -d\' \' -f1-3 /proc/loadavg 2>/dev/null || echo \'0 0 0\')"',
  'printf "MEM=%s\\n" "$(free -m 2>/dev/null | awk \'/^Mem:/{printf "%s %s %s", $3, $2, $7}\' || echo \'0 0 0\')"',
  'printf "SWAP=%s\\n" "$(free -m 2>/dev/null | awk \'/^Swap:/{printf "%s %s", $3, $2}\' || echo \'0 0\')"',
  'printf "REBOOT=%s\\n" "$(test -f /var/run/reboot-required && echo yes || echo no)"',
  'printf "USERS=%s\\n" "$(who 2>/dev/null | wc -l | tr -d \' \')"',
  'printf "FAILED=%s\\n" "$(systemctl list-units --failed --type=service --no-legend --plain --no-pager 2>/dev/null | sed \'s/^[●○][[:space:]]*//\' | awk \'{print $1}\' | paste -sd, - || echo)"',
  'echo BEGIN_DISKS',
  'df -hP -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | awk \'NR>1 && $6 ~ /^\\// {gsub("%","",$5); printf "%s\\t%s\\t%s\\t%s\\t%s\\n", $6, $2, $3, $4, $5}\'',
  'echo END_DISKS',
  'echo BEGIN_INODES',
  'df -iP -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | awk \'NR>1 && $6 ~ /^\\// {gsub("%","",$5); if ($5 ~ /^[0-9]+$/) printf "%s\\t%s\\n", $6, $5}\'',
  'echo END_INODES',
  'echo BEGIN_PROCS',
  'ps -eo user,pid,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | awk \'NR>1 {printf "%s\\t%s\\t%s\\t%s\\t%s\\n", $1, $2, $3, $4, $5}\' | head -n 8',
  'echo END_PROCS',
].join('; ')

const MAX_DISKS = 12
const MAX_PROCS = 8
const MAX_FAILED = 8

function asMap(raw: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of raw.split('\n')) {
    if (
      line === 'BEGIN_DISKS' ||
      line === 'END_DISKS' ||
      line === 'BEGIN_INODES' ||
      line === 'END_INODES' ||
      line === 'BEGIN_PROCS' ||
      line === 'END_PROCS'
    ) {
      continue
    }
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    if (!/^[A-Z_]+$/.test(key)) continue
    map.set(key, line.slice(index + 1).trim())
  }
  return map
}

function nums(raw: string | undefined): number[] {
  if (!raw) return []
  return raw
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value))
}

function block(raw: string, start: string, end: string): string[] {
  const lines = raw.split('\n')
  const from = lines.findIndex((line) => line.trim() === start)
  const to = lines.findIndex((line) => line.trim() === end)
  if (from === -1 || to === -1 || to <= from) return []
  return lines.slice(from + 1, to).map((line) => line.trim()).filter(Boolean)
}

function parseInodes(raw: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const line of block(raw, 'BEGIN_INODES', 'END_INODES')) {
    const [mount, percentRaw] = line.split('\t')
    if (!mount || !mount.startsWith('/')) continue
    const percent = Number(String(percentRaw || '').replace('%', ''))
    if (!Number.isFinite(percent)) continue
    map.set(mount, Math.max(0, Math.min(100, percent)))
  }
  return map
}

function parseDisks(raw: string): DiskMount[] {
  const inodes = parseInodes(raw)
  const disks: DiskMount[] = []
  for (const line of block(raw, 'BEGIN_DISKS', 'END_DISKS')) {
    const [mount, size, used, avail, percentRaw] = line.split('\t')
    if (!mount || !mount.startsWith('/')) continue
    const percent = Number(String(percentRaw || '').replace('%', ''))
    const inodePercent = inodes.get(mount)
    disks.push({
      mount,
      size: size || '—',
      used: used || '—',
      avail: avail || '—',
      percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
      ...(inodePercent !== undefined ? { inodePercent } : {}),
    })
    if (disks.length >= MAX_DISKS) break
  }
  return disks
}

function parseProcesses(raw: string): TopProcess[] {
  const processes: TopProcess[] = []
  for (const line of block(raw, 'BEGIN_PROCS', 'END_PROCS')) {
    const [user, pid, cpuRaw, memRaw, ...rest] = line.split('\t')
    const command = rest.join('\t').trim()
    if (!user || !pid || !command || command === 'ps') continue
    processes.push({
      user,
      pid,
      cpu: Number(cpuRaw) || 0,
      mem: Number(memRaw) || 0,
      command: command.slice(0, 80),
    })
    if (processes.length >= MAX_PROCS) break
  }
  return processes
}

export function worse(left: HealthLevel, right: HealthLevel): HealthLevel {
  const rank = { ok: 0, warn: 1, bad: 2 }
  return rank[right] > rank[left] ? right : left
}

export function ratioLevel(used: number, total: number): HealthLevel {
  if (!(total > 0) || !(used >= 0)) return 'ok'
  const ratio = used / total
  if (ratio >= 0.95) return 'bad'
  if (ratio >= 0.85) return 'warn'
  return 'ok'
}

export function loadLevel(load1: number, cpus: number): HealthLevel {
  const n = Math.max(1, cpus)
  const ratio = load1 / n
  if (ratio >= 1.1) return 'bad'
  if (ratio >= 0.75) return 'warn'
  return 'ok'
}

export function assessHealth(stats: Pick<ServerStats, 'cpuCount' | 'load1' | 'memUsedMb' | 'memTotalMb' | 'disks' | 'failedUnits' | 'rebootRequired'>): {
  load: HealthLevel
  memory: HealthLevel
  disk: HealthLevel
  overall: HealthLevel
  notes: string[]
} {
  const load = loadLevel(stats.load1, stats.cpuCount)
  const memory = ratioLevel(stats.memUsedMb, stats.memTotalMb)
  let disk: HealthLevel = 'ok'
  let hottest = stats.disks[0]
  let hottestInode: (typeof stats.disks)[number] | undefined
  for (const mount of stats.disks) {
    disk = worse(disk, ratioLevel(mount.percent, 100))
    if (!hottest || mount.percent > hottest.percent) hottest = mount
    if (mount.inodePercent != null) {
      disk = worse(disk, ratioLevel(mount.inodePercent, 100))
      if (!hottestInode || mount.inodePercent > (hottestInode.inodePercent ?? 0)) hottestInode = mount
    }
  }
  let overall = worse(worse(load, memory), disk)
  const notes: string[] = []
  if (load === 'bad') notes.push(`CPU load is high (${stats.load1.toFixed(2)} on ${stats.cpuCount} CPU${stats.cpuCount === 1 ? '' : 's'})`)
  else if (load === 'warn') notes.push(`CPU load is elevated (${stats.load1.toFixed(2)})`)
  if (memory === 'bad') notes.push('Memory is almost full')
  else if (memory === 'warn') notes.push('Memory is getting tight')
  if (hottest && ratioLevel(hottest.percent, 100) !== 'ok') notes.push(`Disk ${hottest.mount} is ${hottest.percent}% full`)
  if (hottestInode && hottestInode.inodePercent != null && ratioLevel(hottestInode.inodePercent, 100) !== 'ok') {
    notes.push(`Disk ${hottestInode.mount} is ${hottestInode.inodePercent}% of inodes`)
  }
  if (stats.rebootRequired) {
    notes.push('A reboot is required to finish updates')
    overall = worse(overall, 'warn')
  }
  if (stats.failedUnits > 0) {
    notes.push(`${stats.failedUnits} failed systemd service${stats.failedUnits === 1 ? '' : 's'}`)
    overall = worse(overall, stats.failedUnits > 3 ? 'bad' : 'warn')
  }
  return { load, memory, disk, overall, notes }
}

export function parseHealth(raw: string): ServerStats {
  const map = asMap(raw)
  const cpuCount = Math.max(0, Math.floor(nums(map.get('CPU'))[0] || 0))
  const loadParts = nums(map.get('LOAD'))
  const memParts = nums(map.get('MEM'))
  const swapParts = nums(map.get('SWAP'))
  const memUsedMb = Math.max(0, Math.floor(memParts[0] || 0))
  const memTotalMb = Math.max(0, Math.floor(memParts[1] || 0))
  const memAvailMb = Math.max(0, Math.floor(memParts[2] || 0))
  const swapUsedMb = Math.max(0, Math.floor(swapParts[0] || 0))
  const swapTotalMb = Math.max(0, Math.floor(swapParts[1] || 0))
  const load1 = loadParts[0] || 0
  const load5 = loadParts[1] || 0
  const load15 = loadParts[2] || 0
  const disks = parseDisks(raw)
  const root = disks.find((item) => item.mount === '/') || disks[0]
  const failedUnitNames = (map.get('FAILED') || '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => /^[A-Za-z0-9:._@\\*-]+\.service$/.test(name))
    .slice(0, MAX_FAILED)
  const ips = (map.get('IPS') || '')
    .split(/\s+/)
    .map((ip) => ip.trim())
    .filter((ip) => ip && ip !== 'unknown')
  const users = Math.max(0, Math.floor(nums(map.get('USERS'))[0] || 0))

  return {
    hostname: map.get('HOST') || 'unknown',
    os: map.get('OS') || 'unknown',
    kernel: map.get('KERNEL') || 'unknown',
    arch: map.get('ARCH') || '',
    virt: map.get('VIRT') || '',
    uptime: map.get('UPTIME') || 'unknown',
    time: map.get('TIME') || '',
    ips,
    memory: memTotalMb ? `${memUsedMb}/${memTotalMb} MB` : map.get('MEM') || 'unknown',
    disk: root ? `${root.used}/${root.size}` : 'unknown',
    load: [load1, load5, load15].map((value) => value.toFixed(2)).join(' '),
    cpus: cpuCount ? String(cpuCount) : map.get('CPU') || 'unknown',
    cpuModel: map.get('CPU_MODEL') || '',
    rebootRequired: map.get('REBOOT') === 'yes',
    users,
    cpuCount,
    load1,
    load5,
    load15,
    memUsedMb,
    memTotalMb,
    memAvailMb,
    swapUsedMb,
    swapTotalMb,
    disks,
    failedUnits: failedUnitNames.length,
    failedUnitNames,
    processes: parseProcesses(raw),
  }
}
