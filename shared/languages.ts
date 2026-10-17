export type LanguageId =
  | 'nginx'
  | 'yaml'
  | 'json'
  | 'shell'
  | 'properties'
  | 'javascript'
  | 'html'
  | 'css'
  | 'xml'
  | 'markdown'
  | 'python'
  | 'php'
  | 'sql'
  | 'toml'
  | 'docker'
  | 'text'

const EXTENSIONS: Record<string, LanguageId> = {
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  jsonc: 'json',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ksh: 'shell',
  env: 'properties',
  ini: 'properties',
  cfg: 'properties',
  conf: 'properties',
  cnf: 'properties',
  service: 'properties',
  timer: 'properties',
  socket: 'properties',
  mount: 'properties',
  path: 'properties',
  target: 'properties',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'javascript',
  jsx: 'javascript',
  tsx: 'javascript',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  php: 'php',
  sql: 'sql',
  toml: 'toml',
  dockerfile: 'docker',
}

const LABELS: Record<LanguageId, string> = {
  nginx: 'Nginx',
  yaml: 'YAML',
  json: 'JSON',
  shell: 'Shell',
  properties: 'INI',
  javascript: 'JavaScript',
  html: 'HTML',
  css: 'CSS',
  xml: 'XML',
  markdown: 'Markdown',
  python: 'Python',
  php: 'PHP',
  sql: 'SQL',
  toml: 'TOML',
  docker: 'Dockerfile',
  text: 'Plain text',
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.at(-1) || path
}

function extensionOf(name: string): string {
  if (name.startsWith('.') && !name.slice(1).includes('.')) return name.slice(1).toLowerCase()
  const index = name.lastIndexOf('.')
  if (index <= 0) return ''
  return name.slice(index + 1).toLowerCase()
}

export function languageLabel(id: LanguageId): string {
  return LABELS[id]
}

export function detectLanguage(path: string): LanguageId {
  const file = basename(path).toLowerCase()
  const lower = path.replace(/\\/g, '/').toLowerCase()

  if (file === 'dockerfile' || file.startsWith('dockerfile.') || file === 'containerfile') return 'docker'
  if (file === 'docker-compose.yml' || file === 'docker-compose.yaml' || /^compose\.(yml|yaml)$/.test(file)) {
    return 'yaml'
  }
  if (
    lower.includes('/nginx/') ||
    lower.includes('/sites-available/') ||
    lower.includes('/sites-enabled/')
  ) {
    return 'nginx'
  }
  if (file === '.env' || file.startsWith('.env.') || file.endsWith('.env')) return 'properties'
  if (file === 'hosts' || file === 'fstab' || file === 'resolv.conf') return 'properties'
  if (file === 'makefile' || file === 'cmakelists.txt') return 'text'

  const ext = extensionOf(file)
  if (ext && EXTENSIONS[ext]) return EXTENSIONS[ext]
  return 'text'
}
