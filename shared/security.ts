import type { CertInfo, ListenPort, SecurityFinding, SecuritySnapshot } from './types.ts'
import { parseListenAddress } from './runtime.ts'

export const MAX_PUBLIC_PORTS = 20
export const MAX_CERTS = 6

/** Cheap checks only: no find, no nginx -T, no package lists. */
export const SECURITY_SCRIPT = [
  'echo BEGIN_META',
  'printf "SSH_ROOT=%s\\n" "$(awk \'/^PermitRootLogin/{print $2; exit}\' /etc/ssh/sshd_config 2>/dev/null || echo unknown)"',
  'printf "SSH_PASSWORD=%s\\n" "$(awk \'/^PasswordAuthentication/{print $2; exit}\' /etc/ssh/sshd_config 2>/dev/null || echo unknown)"',
  'printf "UFW=%s\\n" "$(ufw status 2>/dev/null | awk \'NR==1{print; exit}\' || echo unknown)"',
  'printf "FAIL2BAN=%s\\n" "$(systemctl is-active fail2ban 2>/dev/null || echo missing)"',
  'printf "DOCKER_SOCK=%s\\n" "$(ls -l /var/run/docker.sock 2>/dev/null | awk \'{print $1}\' || echo missing)"',
  'printf "WWW_ENV=%s\\n" "$(if [ -e /var/www/.env ] || [ -e /var/www/html/.env ]; then echo yes; else echo no; fi)"',
  'printf "WWW_GIT=%s\\n" "$(if [ -d /var/www/.git ] || [ -d /var/www/html/.git ]; then echo yes; else echo no; fi)"',
  'echo END_META',
  'echo BEGIN_PUBLIC',
  "ss -lntH 2>/dev/null | awk '{print $4}' | head -n 20",
  'echo END_PUBLIC',
  'echo BEGIN_CERTS',
  'n=0; for d in /etc/letsencrypt/live/*; do [ -f "$d/cert.pem" ] || continue; n=$((n+1)); [ "$n" -gt 6 ] && break; end=$(openssl x509 -enddate -noout -in "$d/cert.pem" 2>/dev/null | cut -d= -f2); printf "%s\\t%s\\n" "$(basename "$d")" "$end"; done',
  'echo END_CERTS',
].join('; ')

function block(raw: string, start: string, end: string): string[] {
  const lines = raw.split('\n')
  const from = lines.findIndex((line) => line.trim() === start)
  const to = lines.findIndex((line) => line.trim() === end)
  if (from === -1 || to === -1 || to <= from) return []
  return lines.slice(from + 1, to).map((line) => line.trim()).filter(Boolean)
}

function meta(raw: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of block(raw, 'BEGIN_META', 'END_META')) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    map.set(line.slice(0, index).trim(), line.slice(index + 1).trim())
  }
  return map
}

function parseCerts(raw: string, now = Date.now()): CertInfo[] {
  const certs: CertInfo[] = []
  for (const line of block(raw, 'BEGIN_CERTS', 'END_CERTS')) {
    const [name, expires = ''] = line.split('\t')
    if (!name) continue
    const stamp = expires ? Date.parse(expires) : Number.NaN
    const days = Number.isFinite(stamp) ? Math.round((stamp - now) / 86_400_000) : undefined
    certs.push({ name, expires, days })
    if (certs.length >= MAX_CERTS) break
  }
  return certs
}

function parsePublic(raw: string): ListenPort[] {
  const ports: ListenPort[] = []
  const seen = new Set<string>()
  for (const line of block(raw, 'BEGIN_PUBLIC', 'END_PUBLIC')) {
    const parsed = parseListenAddress(line)
    if (!parsed || !parsed.public) continue
    const key = `${parsed.address}:${parsed.port}`
    if (seen.has(key)) continue
    seen.add(key)
    ports.push(parsed)
    if (ports.length >= MAX_PUBLIC_PORTS) break
  }
  return ports
}

const USUAL = new Set([22, 80, 443])

export function parseSecurity(raw: string, now = Date.now()): SecuritySnapshot {
  const info = meta(raw)
  const publicPorts = parsePublic(raw)
  const certs = parseCerts(raw, now)
  const findings: SecurityFinding[] = []

  const root = (info.get('SSH_ROOT') || 'unknown').toLowerCase()
  if (root === 'yes') {
    findings.push({ id: 'ssh-root', level: 'bad', title: 'Root SSH login is on', detail: 'PermitRootLogin yes. Prefer keys as a normal user.' })
  } else if (root === 'unknown') {
    findings.push({ id: 'ssh-root', level: 'ok', title: 'Root SSH uses the distro default', detail: 'No explicit PermitRootLogin. Ubuntu default is usually prohibit-password.' })
  } else {
    findings.push({ id: 'ssh-root', level: 'ok', title: 'Root SSH login is restricted', detail: `PermitRootLogin ${root}` })
  }

  const password = (info.get('SSH_PASSWORD') || 'unknown').toLowerCase()
  if (password === 'yes') {
    findings.push({ id: 'ssh-password', level: 'warn', title: 'SSH passwords are allowed', detail: 'PasswordAuthentication yes. Keys are safer on a public VPS.' })
  } else if (password === 'no') {
    findings.push({ id: 'ssh-password', level: 'ok', title: 'SSH passwords are off', detail: 'Only key login is configured.' })
  }

  const ufw = info.get('UFW') || 'unknown'
  if (/inactive/i.test(ufw)) {
    findings.push({ id: 'ufw', level: 'warn', title: 'UFW is inactive', detail: ufw })
  } else if (/active/i.test(ufw)) {
    findings.push({ id: 'ufw', level: 'ok', title: 'UFW is active', detail: ufw })
  }

  const fail2ban = info.get('FAIL2BAN') || 'missing'
  if (fail2ban === 'active') {
    findings.push({ id: 'fail2ban', level: 'ok', title: 'fail2ban is running', detail: 'Brute-force SSH attempts can be banned.' })
  } else {
    findings.push({ id: 'fail2ban', level: 'warn', title: 'fail2ban is not running', detail: fail2ban === 'missing' ? 'Not installed or not a systemd unit.' : fail2ban })
  }

  const sock = info.get('DOCKER_SOCK') || 'missing'
  const mode = sock.replace(/^[a-zA-Z?]/, '')
  if (sock !== 'missing' && mode.length >= 9 && mode[7] === 'w') {
    findings.push({ id: 'docker-sock', level: 'bad', title: 'Docker socket looks world-accessible', detail: sock })
  }

  if (info.get('WWW_ENV') === 'yes') {
    findings.push({ id: 'www-env', level: 'warn', title: '.env under /var/www', detail: 'A web root .env can be served as a static file. Move it outside the site root.' })
  }
  if (info.get('WWW_GIT') === 'yes') {
    findings.push({ id: 'www-git', level: 'warn', title: '.git under /var/www', detail: 'A public .git folder can leak source. Block it in nginx or move the repo.' })
  }

  const odd = publicPorts.filter((item) => !USUAL.has(item.port))
  if (odd.length) {
    findings.push({
      id: 'ports',
      level: 'warn',
      title: `${odd.length} public port${odd.length === 1 ? '' : 's'} besides 22/80/443`,
      detail: odd.map((item) => `${item.address}:${item.port}`).join(', '),
    })
  }

  for (const cert of certs) {
    if (cert.days === undefined) continue
    if (cert.days < 0) {
      findings.push({ id: `cert-${cert.name}`, level: 'bad', title: `Certificate expired: ${cert.name}`, detail: cert.expires })
    } else if (cert.days <= 14) {
      findings.push({ id: `cert-${cert.name}`, level: 'warn', title: `Certificate expires in ${cert.days} days: ${cert.name}`, detail: cert.expires })
    }
  }

  return { findings, publicPorts, certs }
}
