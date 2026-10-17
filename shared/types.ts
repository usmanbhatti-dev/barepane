export type SshAuth = {
  host: string
  port: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  useAgent?: boolean
  forwardAgent?: boolean
}

export type ConnectPayload = SshAuth & {
  jump?: SshAuth
}

export type ConnectResult = {
  id: string
  home: string
  username: string
  host: string
  port: number
  forwardAgent?: boolean
  hostFingerprint?: string
}

export type SavedJump = {
  host: string
  port: number
  username: string
  privateKeyPath?: string
  useAgent?: boolean
  forwardAgent?: boolean
}

export type SavedSession = {
  id: string
  name: string
  host: string
  port: number
  username: string
  privateKeyPath?: string
  useAgent?: boolean
  forwardAgent?: boolean
  jump?: SavedJump
}

export type RemoteFile = {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size: number
  modifiedAt: number
  permissions: string
}

export type HealthLevel = 'ok' | 'warn' | 'bad'

export type DiskMount = {
  mount: string
  size: string
  used: string
  avail: string
  percent: number
  inodePercent?: number
}

export type TopProcess = {
  user: string
  pid: string
  cpu: number
  mem: number
  command: string
}

export type ServerStats = {
  hostname: string
  os: string
  kernel: string
  arch: string
  virt: string
  uptime: string
  time: string
  ips: string[]
  memory: string
  disk: string
  load: string
  cpus: string
  cpuModel: string
  rebootRequired: boolean
  users: number
  cpuCount: number
  load1: number
  load5: number
  load15: number
  memUsedMb: number
  memTotalMb: number
  memAvailMb: number
  swapUsedMb: number
  swapTotalMb: number
  disks: DiskMount[]
  failedUnits: number
  failedUnitNames: string[]
  processes: TopProcess[]
}

export type FileStat = {
  path: string
  size: number
  modifiedAt: number
  isDirectory: boolean
}

export type TunnelKind = 'local' | 'remote' | 'socks'

export type TunnelDraft = {
  kind: TunnelKind
  listenPort: number
  destHost?: string
  destPort?: number
}

export type TunnelInfo = TunnelDraft & {
  id: string
}

export type LogKind = 'journal' | 'file' | 'docker'
export type LogScope = 'system' | 'user'
export type LogPriority = 'emerg' | 'alert' | 'crit' | 'err' | 'warning' | 'notice' | 'info' | 'debug'

export type LogDraft = {
  kind: LogKind
  scope?: LogScope
  unit?: string
  priority?: LogPriority
  path?: string
  container?: string
  lines?: number
  sudo?: boolean
}

export type LogStreamInfo = {
  id: string
  kind: LogKind
  label: string
  scope?: LogScope
  unit?: string
  priority?: LogPriority
  path?: string
  container?: string
  sudo?: boolean
}

export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable'
export type ContainerAction = 'start' | 'stop' | 'restart'

export type ServiceUnit = {
  name: string
  load: string
  active: string
  sub: string
  description: string
}

export type DockerContainer = {
  id: string
  name: string
  image: string
  status: string
  ports: string
}

export type ContainerList = {
  items: DockerContainer[]
  missing?: boolean
  daemon?: boolean
  error?: string
}

export type SearchOptions = {
  dirsOnly?: boolean
  maxDepth?: number
  limit?: number
}

export type ContentHit = {
  path: string
  name: string
  line: number
  text: string
}

export type TransferKind = 'upload' | 'download'
export type TransferStatus = 'running' | 'done' | 'error' | 'cancelled'

export type TransferProgress = {
  id: string
  kind: TransferKind
  name: string
  transferred: number
  total: number
  status: TransferStatus
  error?: string
}

export type SiteAction = 'nginx-test' | 'nginx-reload' | 'php-reload'

export type ListenPort = {
  address: string
  port: number
  public: boolean
}

export type RuntimeStack = {
  kind: 'node' | 'python' | 'php' | 'web' | 'java' | 'pm2' | 'docker'
  name: string
  count: number
}

export type Pm2App = {
  name: string
  status: string
  pid: number
  restarts: number
  outLog?: string
}

export type ComposeProject = {
  name: string
  status: string
  configFile?: string
}

export type SiteVhost = {
  file: string
  serverName: string
  root: string
  proxy: string
  kind: 'static' | 'proxy' | 'unknown'
}

export type RuntimeSnapshot = {
  stacks: RuntimeStack[]
  ports: ListenPort[]
  pm2: Pm2App[]
  pm2Missing: boolean
  compose: ComposeProject[]
  restarting: string[]
  vhosts: SiteVhost[]
}

export type Pm2Action = 'restart' | 'start' | 'stop'
export type ComposeAction = 'up' | 'down' | 'restart'

export type SecurityFinding = {
  id: string
  level: 'ok' | 'warn' | 'bad'
  title: string
  detail: string
}

export type CertInfo = {
  name: string
  expires: string
  days?: number
}

export type SecuritySnapshot = {
  findings: SecurityFinding[]
  publicPorts: ListenPort[]
  certs: CertInfo[]
}

export type BarepaneApi = {
  connect: (payload: ConnectPayload) => Promise<ConnectResult>
  disconnect: (sessionId: string) => Promise<void>
  listDir: (sessionId: string, path: string) => Promise<RemoteFile[]>
  stat: (sessionId: string, path: string) => Promise<FileStat>
  readFile: (sessionId: string, path: string) => Promise<string>
  writeFile: (sessionId: string, path: string, content: string, sudoPassword?: string) => Promise<void>
  mkdir: (sessionId: string, path: string, sudoPassword?: string) => Promise<void>
  rename: (sessionId: string, fromPath: string, toPath: string, sudoPassword?: string) => Promise<void>
  remove: (sessionId: string, path: string, sudoPassword?: string) => Promise<void>
  search: (sessionId: string, dirPath: string, query: string, options?: SearchOptions) => Promise<RemoteFile[]>
  grep: (sessionId: string, dirPath: string, query: string, options?: SearchOptions) => Promise<ContentHit[]>
  downloadFile: (sessionId: string, remotePath: string, localPath: string) => Promise<void>
  uploadFile: (sessionId: string, localPath: string, remotePath: string, sudoPassword?: string) => Promise<void>
  runSiteAction: (sessionId: string, action: SiteAction, sudoPassword?: string) => Promise<string>
  chmod: (sessionId: string, path: string, mode: string, sudoPassword?: string) => Promise<void>
  pickSavePath: (defaultName: string) => Promise<string | null>
  pickDirectory: () => Promise<string | null>
  pickOpenFiles: () => Promise<string[]>
  pickPrivateKey: () => Promise<string | null>
  readSshConfig: () => Promise<SavedSession[]>
  cancelTransfer: (sessionId: string, transferId: string) => Promise<void>
  saveLocalText: (defaultName: string, content: string) => Promise<boolean>
  openLocalText: () => Promise<string | null>
  listDefaultKeys: () => Promise<string[]>
  hasSshAgent: () => Promise<boolean>
  getPathForFile: (file: File) => string
  getStats: (sessionId: string) => Promise<ServerStats>
  getHealth: (sessionId: string) => Promise<ServerStats>
  getRuntime: (sessionId: string) => Promise<RuntimeSnapshot>
  getSecurity: (sessionId: string) => Promise<SecuritySnapshot>
  controlPm2: (sessionId: string, name: string, action: Pm2Action) => Promise<void>
  controlCompose: (sessionId: string, name: string, action: ComposeAction, configFile?: string) => Promise<void>
  openLocalUrl: (url: string) => Promise<void>
  openShell: (sessionId: string) => Promise<string>
  closeShell: (sessionId: string, shellId: string) => Promise<void>
  listShells: (sessionId: string) => Promise<string[]>
  writeTerminal: (sessionId: string, shellId: string, data: string) => void
  writeAllTerminals: (sessionId: string, data: string) => void
  readClipboard: () => Promise<string>
  writeClipboard: (text: string) => Promise<void>
  resizeTerminal: (sessionId: string, shellId: string, cols: number, rows: number) => void
  readyTerminal: (sessionId: string, shellId: string) => void
  openTunnel: (sessionId: string, draft: TunnelDraft) => Promise<TunnelInfo>
  closeTunnel: (sessionId: string, tunnelId: string) => Promise<void>
  listTunnels: (sessionId: string) => Promise<TunnelInfo[]>
  openLog: (sessionId: string, draft: LogDraft, sudoPassword?: string) => Promise<LogStreamInfo>
  closeLog: (sessionId: string, logId: string) => Promise<void>
  listLogs: (sessionId: string) => Promise<LogStreamInfo[]>
  listUnits: (sessionId: string, sudoPassword?: string) => Promise<ServiceUnit[]>
  controlUnit: (sessionId: string, unit: string, action: ServiceAction, sudoPassword?: string) => Promise<void>
  listContainers: (sessionId: string, sudoPassword?: string) => Promise<ContainerList>
  controlContainer: (sessionId: string, name: string, action: ContainerAction, sudoPassword?: string) => Promise<void>
  onTerminalData: (callback: (sessionId: string, shellId: string, data: string) => void) => () => void
  onLogData: (callback: (sessionId: string, logId: string, data: string) => void) => () => void
  onLogClosed: (callback: (sessionId: string, logId: string, reason: string) => void) => () => void
  onDisconnected: (callback: (sessionId: string, reason: string) => void) => () => void
  onTransfer: (callback: (sessionId: string, transfer: TransferProgress) => void) => () => void
}

export type UbuntuApi = BarepaneApi
