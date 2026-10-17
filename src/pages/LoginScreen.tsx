import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { APP_NAME } from '@shared/brand'
import { formatSshError } from '@shared/errors'
import { parseConnectionTarget } from '@shared/paths'
import { defaultSessionName, mergeSavedSessions, parseServersExport, serializeSavedSessions } from '@shared/sessions'
import { STORAGE } from '@shared/storage'
import { applySecrets, secretsFromForm } from '@shared/vault'
import type { ConnectPayload, ConnectResult, SavedSession } from '@shared/types'
import HelpOverlay, { useHelpHotkey } from '../components/HelpOverlay'
import VaultDialog from '../components/VaultDialog'
import { deleteSavedSession, loadSavedSessions, saveSavedSessions, upsertSavedSession } from '../lib/savedSessions'
import {
  changeMasterPassword,
  createMasterPassword,
  forgetVault,
  getVaultVersion,
  hasVault,
  isVaultUnlocked,
  lockVault,
  putVaultSecrets,
  removeVaultSecrets,
  subscribeVault,
  unlockVault,
  vaultSecretsFor,
} from '../lib/vaultStore'

const REMEMBER_SECRETS_KEY = STORAGE.rememberSecrets

function keyLabel(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts.at(-1) || filePath
}

type FormState = {
  id: string
  name: string
  host: string
  port: string
  username: string
  password: string
  passphrase: string
  privateKeyPath: string
  useAgent: boolean
  forwardAgent: boolean
  jumpEnabled: boolean
  jumpHost: string
  jumpPort: string
  jumpUsername: string
  jumpPassword: string
  jumpPassphrase: string
  jumpKeyPath: string
  jumpUseAgent: boolean
}

function emptyForm(useAgent = true): FormState {
  return {
    id: crypto.randomUUID(),
    name: '',
    host: '',
    port: '22',
    username: '',
    password: '',
    passphrase: '',
    privateKeyPath: '',
    useAgent,
    forwardAgent: false,
    jumpEnabled: false,
    jumpHost: '',
    jumpPort: '22',
    jumpUsername: '',
    jumpPassword: '',
    jumpPassphrase: '',
    jumpKeyPath: '',
    jumpUseAgent: useAgent,
  }
}

function formFromSaved(session: SavedSession, useAgent: boolean): FormState {
  return {
    ...emptyForm(useAgent),
    id: session.id,
    name: session.name,
    host: session.host,
    port: String(session.port),
    username: session.username,
    privateKeyPath: session.privateKeyPath || '',
    useAgent: session.useAgent !== false,
    forwardAgent: session.forwardAgent === true,
    jumpEnabled: Boolean(session.jump),
    jumpHost: session.jump?.host || '',
    jumpPort: String(session.jump?.port || 22),
    jumpUsername: session.jump?.username || '',
    jumpKeyPath: session.jump?.privateKeyPath || '',
    jumpUseAgent: session.jump?.useAgent !== false,
  }
}

function toPayload(form: FormState, hasAgent: boolean): ConnectPayload {
  const parsedTarget = parseConnectionTarget(form.host)
  const payload: ConnectPayload = {
    host: parsedTarget.host,
    port: Number(form.port),
    username: parsedTarget.username || form.username.trim(),
    password: form.password || undefined,
    privateKeyPath: form.privateKeyPath || undefined,
    passphrase: form.passphrase || undefined,
    useAgent: form.useAgent && hasAgent,
    forwardAgent: form.forwardAgent && hasAgent,
  }
  if (form.jumpEnabled && form.jumpHost.trim() && form.jumpUsername.trim()) {
    payload.jump = {
      host: parseConnectionTarget(form.jumpHost).host,
      port: Number(form.jumpPort),
      username: form.jumpUsername.trim(),
      password: form.jumpPassword || undefined,
      privateKeyPath: form.jumpKeyPath || undefined,
      passphrase: form.jumpPassphrase || undefined,
      useAgent: form.jumpUseAgent && hasAgent,
    }
  }
  return payload
}

function toSaved(form: FormState, payload: ConnectPayload): SavedSession {
  const saved: SavedSession = {
    id: form.id,
    name: form.name.trim() || defaultSessionName(payload.username, payload.host),
    host: payload.host,
    port: payload.port,
    username: payload.username,
    privateKeyPath: payload.privateKeyPath,
    useAgent: form.useAgent,
    forwardAgent: form.forwardAgent,
  }
  if (payload.jump) {
    saved.jump = {
      host: payload.jump.host,
      port: payload.jump.port,
      username: payload.jump.username,
      privateKeyPath: payload.jump.privateKeyPath,
      useAgent: form.jumpUseAgent,
    }
  }
  return saved
}

type Props = {
  onConnected: (session: ConnectResult, payload: ConnectPayload) => void
  reconnectMessage?: string
  onCancel?: () => void
}

export default function LoginScreen({ onConnected, reconnectMessage, onCancel }: Props) {
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadSavedSessions())
  const [form, setForm] = useState<FormState>(() => {
    const saved = loadSavedSessions()[0]
    return saved ? formFromSaved(saved, true) : emptyForm()
  })
  const [hasAgent, setHasAgent] = useState(false)
  const [defaultKeys, setDefaultKeys] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [remember, setRemember] = useState(true)
  const [rememberSecrets, setRememberSecrets] = useState(() => localStorage.getItem(REMEMBER_SECRETS_KEY) === '1')
  const [vaultMode, setVaultMode] = useState<'create' | 'unlock' | 'change' | 'forget' | null>(null)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [showHelp, setShowHelp] = useState(
    () => !onCancel && loadSavedSessions().length === 0 && localStorage.getItem(STORAGE.helpSeen) !== '1',
  )
  const wantSecrets = useRef(false)
  const pendingConnect = useRef<SavedSession | null>(null)
  useSyncExternalStore(subscribeVault, getVaultVersion, getVaultVersion)
  const vaultReady = isVaultUnlocked()
  const vaultExists = hasVault()

  useEffect(() => {
    if (!window.barepane) return
    void window.barepane.hasSshAgent().then(setHasAgent)
    void window.barepane.listDefaultKeys().then((keys) => {
      setDefaultKeys(keys)
      setForm((current) => (current.privateKeyPath ? current : { ...current, privateKeyPath: keys[0] || '' }))
    })
  }, [])

  const selectedId = form.id
  const overlay = Boolean(onCancel)

  function openHelp() {
    setShowHelp(true)
  }

  function closeHelp() {
    localStorage.setItem(STORAGE.helpSeen, '1')
    setShowHelp(false)
  }

  useHelpHotkey(showHelp, openHelp, closeHelp)

  function patch(partial: Partial<FormState>) {
    setForm((current) => ({ ...current, ...partial }))
  }

  function chooseSaved(session: SavedSession) {
    setError('')
    setInfo('')
    setForm(applySecrets(formFromSaved(session, hasAgent), vaultSecretsFor(session.id)))
  }

  function filledForm(session: SavedSession): FormState {
    return applySecrets(formFromSaved(session, hasAgent), vaultSecretsFor(session.id))
  }

  function canConnect(next: FormState): boolean {
    const payload = toPayload(next, hasAgent)
    return Boolean(payload.password || payload.privateKeyPath || payload.useAgent)
  }

  async function connectSaved(session: SavedSession) {
    const next = filledForm(session)
    setForm(next)
    if (!canConnect(next) && vaultExists && !vaultReady) {
      pendingConnect.current = session
      setVaultMode('unlock')
      return
    }
    await connectWith(next)
  }

  function startNew() {
    setError('')
    setInfo('')
    const next = emptyForm(hasAgent)
    if (defaultKeys[0]) next.privateKeyPath = defaultKeys[0]
    setForm(next)
  }

  async function chooseKey(jump = false) {
    const next = await window.barepane.pickPrivateKey()
    if (!next) return
    if (jump) patch({ jumpKeyPath: next })
    else patch({ privateKeyPath: next })
  }

  async function exportServers() {
    setError('')
    setInfo('')
    const list = loadSavedSessions()
    if (!list.length) {
      setError('No saved servers to export. Save or connect first.')
      return
    }
    const wrote = await window.barepane.saveLocalText('barepane-servers.json', serializeSavedSessions(list))
    if (wrote) setInfo('Exported hosts, users, and key paths. Passwords are not in that file.')
  }

  async function importServers() {
    setError('')
    setInfo('')
    const text = await window.barepane.openLocalText()
    if (!text) return
    try {
      const incoming = parseServersExport(JSON.parse(text) as unknown)
      if (!incoming.length) {
        setError('That file has no servers. Export writes host, user, and key path only — never passwords.')
        return
      }
      setSessions(saveSavedSessions(mergeSavedSessions(loadSavedSessions(), incoming)))
      setInfo(`Imported ${incoming.length} server${incoming.length === 1 ? '' : 's'}. Passwords are never in that file.`)
    } catch {
      setError('Could not read that servers file.')
    }
  }

  async function connectWith(next: FormState) {
    setError('')
    setInfo('')
    const payload = toPayload(next, hasAgent)
    if (!payload.host || !payload.username) {
      setError('IP/host and user are required.')
      return
    }
    if (!Number.isInteger(payload.port) || payload.port < 1 || payload.port > 65535) {
      setError('Port must be a number between 1 and 65535.')
      return
    }
    if (!payload.password && !payload.privateKeyPath && !payload.useAgent) {
      setError('Add a password, an SSH key, or enable the SSH agent.')
      return
    }
    if (next.jumpEnabled) {
      if (!payload.jump?.host || !payload.jump.username) {
        setError('Jump host and user are required.')
        return
      }
      if (!Number.isInteger(payload.jump.port) || payload.jump.port < 1 || payload.jump.port > 65535) {
        setError('Jump port must be a number between 1 and 65535.')
        return
      }
    }

    setBusy(true)
    if (!window.barepane) {
      setError(`${APP_NAME} is a desktop app. Open the app window, not a browser tab.`)
      setBusy(false)
      return
    }
    try {
      const session = await window.barepane.connect(payload)
      if (remember) setSessions(upsertSavedSession(toSaved(next, payload)))
      if (remember && rememberSecrets && vaultReady) {
        await putVaultSecrets(next.id, secretsFromForm(next))
      }
      setForm({ ...next, password: '', passphrase: '', jumpPassword: '', jumpPassphrase: '' })
      localStorage.setItem(STORAGE.helpSeen, '1')
      onConnected(session, payload)
    } catch (err) {
      setError(formatSshError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await connectWith(form)
  }

  async function importSshConfig() {
    setError('')
    setInfo('')
    try {
      const incoming = await window.barepane.readSshConfig()
      if (!incoming.length) {
        setError('No usable Host entries in ~/.ssh/config. Wildcards and Include files are skipped.')
        return
      }
      setSessions(saveSavedSessions(mergeSavedSessions(loadSavedSessions(), incoming)))
      setInfo(`Imported ${incoming.length} host${incoming.length === 1 ? '' : 's'} from ~/.ssh/config.`)
    } catch (err) {
      setError(formatSshError(err))
    }
  }

  function saveOnly() {
    const payload = toPayload(form, hasAgent)
    if (!payload.host || !payload.username) {
      setError('IP/host and user are required to save.')
      return
    }
    setSessions(upsertSavedSession(toSaved(form, payload)))
    if (rememberSecrets && vaultReady) {
      void putVaultSecrets(form.id, secretsFromForm(form))
    }
    setError('')
  }

  function removeSaved(id: string) {
    setSessions(deleteSavedSession(id))
    void removeVaultSecrets(id)
    if (form.id === id) startNew()
  }

  function requestRememberSecrets(checked: boolean) {
    if (!checked) {
      setRememberSecrets(false)
      localStorage.setItem(REMEMBER_SECRETS_KEY, '0')
      return
    }
    wantSecrets.current = true
    if (!vaultExists) {
      setVaultMode('create')
      return
    }
    if (!vaultReady) {
      setVaultMode('unlock')
      return
    }
    setRememberSecrets(true)
    localStorage.setItem(REMEMBER_SECRETS_KEY, '1')
  }

  async function finishVaultOpen() {
    if (wantSecrets.current) {
      setRememberSecrets(true)
      localStorage.setItem(REMEMBER_SECRETS_KEY, '1')
    }
    wantSecrets.current = false
    setVaultMode(null)
    const pending = pendingConnect.current
    pendingConnect.current = null
    if (pending) {
      const next = applySecrets(formFromSaved(pending, hasAgent), vaultSecretsFor(pending.id))
      setForm(next)
      await connectWith(next)
      return
    }
    setForm((current) => applySecrets(current, vaultSecretsFor(current.id)))
  }

  const formCard = (
    <form onSubmit={(event) => void handleSubmit(event)} className="ui-panel grid grid-cols-2 gap-x-3 gap-y-2.5 p-4">
      <label className="col-span-2 block">
        <span className="ui-label">Name</span>
        <input
          value={form.name}
          disabled={busy}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder={form.host ? defaultSessionName(form.username, parseConnectionTarget(form.host).host || form.host) : 'Prod VPS'}
          className="ui-input"
        />
      </label>
      <label className="col-span-2 block">
        <span className="ui-label">Host</span>
        <input
          autoFocus={!overlay}
          value={form.host}
          disabled={busy}
          onChange={(event) => patch({ host: event.target.value })}
          onBlur={(event) => {
            const parsed = parseConnectionTarget(event.target.value)
            patch({
              host: parsed.host,
              username: parsed.username || form.username,
            })
          }}
          placeholder="192.168.1.10 or ubuntu@vps.example.com"
          className="ui-input"
        />
      </label>
      <label className="block">
        <span className="ui-label">User</span>
        <input
          value={form.username}
          disabled={busy}
          onChange={(event) => patch({ username: event.target.value })}
          placeholder="ubuntu"
          autoComplete="username"
          className="ui-input"
        />
      </label>
      <label className="block">
        <span className="ui-label">Port</span>
        <input
          value={form.port}
          disabled={busy}
          onChange={(event) => patch({ port: event.target.value })}
          placeholder="22"
          inputMode="numeric"
          className="ui-input"
        />
      </label>
      <label className="block">
        <span className="ui-label">Password</span>
        <input
          type="password"
          value={form.password}
          disabled={busy}
          onChange={(event) => patch({ password: event.target.value })}
          placeholder="If the server allows it"
          autoComplete="current-password"
          className="ui-input"
        />
      </label>
      <div className="block">
        <span className="ui-label">SSH key</span>
        <div className="flex gap-1.5">
          <input
            readOnly
            value={form.privateKeyPath ? keyLabel(form.privateKeyPath) : ''}
            placeholder="None"
            title={form.privateKeyPath || undefined}
            className="ui-input min-w-0 flex-1"
          />
          <button type="button" className="ui-btn shrink-0" disabled={busy} onClick={() => void chooseKey()}>
            Browse
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-white/40">
          Works with AWS <span className="font-mono text-white/55">.pem</span> files, OpenSSH, and RSA keys. AWS users are often <span className="font-mono text-white/55">ubuntu</span> or <span className="font-mono text-white/55">ec2-user</span>.
        </p>
      </div>
      <label className="block">
        <span className="ui-label">Key passphrase</span>
        <input
          type="password"
          value={form.passphrase}
          disabled={busy || !form.privateKeyPath}
          onChange={(event) => patch({ passphrase: event.target.value })}
          placeholder="Lock on the key file, not the VPS password"
          className="ui-input"
        />
      </label>
      <div className="flex flex-col justify-end pb-0.5">
        {hasAgent ? (
          <div className="flex flex-col justify-end gap-1 pb-0.5">
            <label className="flex h-[2.15rem] items-center gap-2 text-sm text-white/75">
              <input
                type="checkbox"
                className="ui-check"
                checked={form.useAgent}
                onChange={(event) => patch({ useAgent: event.target.checked })}
              />
              Use ssh-agent
            </label>
            <label className="flex items-center gap-2 text-sm text-white/75" title="Lets this server use your local ssh-agent. Only enable on hosts you trust.">
              <input
                type="checkbox"
                className="ui-check"
                checked={form.forwardAgent}
                onChange={(event) => patch({ forwardAgent: event.target.checked, useAgent: event.target.checked ? true : form.useAgent })}
              />
              Forward agent
            </label>
          </div>
        ) : (
          <p className="text-xs leading-5 text-white/40">No ssh-agent. Use a password or key file.</p>
        )}
      </div>
      {defaultKeys.length > 1 ? (
        <div className="col-span-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-white/40">Keys found</span>
          {defaultKeys.map((file) => (
            <button
              key={file}
              type="button"
              className={`rounded-md px-2 py-0.5 text-[11px] ${
                form.privateKeyPath === file ? 'bg-accent text-white' : 'bg-white/8 text-white/65 hover:bg-white/12'
              }`}
              onClick={() => patch({ privateKeyPath: file === form.privateKeyPath ? '' : file })}
            >
              {keyLabel(file)}
            </button>
          ))}
          {form.privateKeyPath ? (
            <button type="button" className="text-[11px] text-white/40 hover:text-white/70" onClick={() => patch({ privateKeyPath: '' })}>
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      <label className="col-span-2 flex items-center gap-2 text-sm text-white/75">
        <input
          type="checkbox"
          className="ui-check"
          checked={form.jumpEnabled}
          onChange={(event) => patch({ jumpEnabled: event.target.checked })}
        />
        Jump host / bastion
      </label>
      {form.jumpEnabled ? (
        <>
          <label className="col-span-2 block">
            <span className="ui-label">Jump host</span>
            <input
              value={form.jumpHost}
              disabled={busy}
              onChange={(event) => patch({ jumpHost: event.target.value })}
              placeholder="bastion.example.com"
              className="ui-input"
            />
          </label>
          <label className="block">
            <span className="ui-label">Jump user</span>
            <input
              value={form.jumpUsername}
              disabled={busy}
              onChange={(event) => patch({ jumpUsername: event.target.value })}
              placeholder="ubuntu"
              className="ui-input"
            />
          </label>
          <label className="block">
            <span className="ui-label">Jump port</span>
            <input
              value={form.jumpPort}
              disabled={busy}
              onChange={(event) => patch({ jumpPort: event.target.value })}
              placeholder="22"
              inputMode="numeric"
              className="ui-input"
            />
          </label>
          <label className="block">
            <span className="ui-label">Jump password</span>
            <input
              type="password"
              value={form.jumpPassword}
              disabled={busy}
              onChange={(event) => patch({ jumpPassword: event.target.value })}
              className="ui-input"
            />
          </label>
          <div className="block">
            <span className="ui-label">Jump key</span>
            <div className="flex gap-1.5">
              <input
                readOnly
                value={form.jumpKeyPath ? keyLabel(form.jumpKeyPath) : ''}
                placeholder="None"
                className="ui-input min-w-0 flex-1"
              />
              <button type="button" className="ui-btn shrink-0" disabled={busy} onClick={() => void chooseKey(true)}>
                Browse
              </button>
            </div>
          </div>
          <label className="block">
            <span className="ui-label">Jump key passphrase</span>
            <input
              type="password"
              value={form.jumpPassphrase}
              disabled={busy || !form.jumpKeyPath}
              onChange={(event) => patch({ jumpPassphrase: event.target.value })}
              className="ui-input"
            />
          </label>
          {hasAgent ? (
            <label className="flex h-[2.15rem] items-center gap-2 text-sm text-white/75">
              <input
                type="checkbox"
                className="ui-check"
                checked={form.jumpUseAgent}
                onChange={(event) => patch({ jumpUseAgent: event.target.checked })}
              />
              Jump ssh-agent
            </label>
          ) : (
            <div />
          )}
        </>
      ) : null}

      {reconnectMessage ? (
        <div className="col-span-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-100">
          Disconnected: {reconnectMessage}
        </div>
      ) : null}
      {info ? (
        <div className="col-span-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-100">
          {info}
        </div>
      ) : null}
      {error ? (
        <div className="col-span-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      <label className="col-span-2 flex items-center gap-2 text-sm text-white/70">
        <input type="checkbox" className="ui-check" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
        Remember this server
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          className="ui-check"
          checked={rememberSecrets && vaultReady}
          onChange={(event) => requestRememberSecrets(event.target.checked)}
        />
        Remember password (encrypted)
      </label>
      <div className="col-span-2 flex gap-2">
        {onCancel ? (
          <button type="button" className="ui-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="button" className="ui-btn" disabled={busy} onClick={saveOnly}>
          Save
        </button>
        <button type="submit" disabled={busy} aria-busy={busy} className="ui-btn-primary flex-1">
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>
      <p className="col-span-2 text-center text-[11px] text-white/35">
        {vaultReady
          ? 'Passwords are encrypted with your master password on this computer.'
          : 'Host, user, and key path can be remembered. Unlock a vault to save passwords.'}
      </p>
    </form>
  )

  const body = (
    <div className="relative mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center gap-4 px-5 py-4 lg:flex-row lg:items-start">
      <aside className="ui-panel w-full shrink-0 p-3 lg:w-64">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/45">Saved servers</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="text-[11px] font-semibold text-accent-fg hover:text-white" onClick={startNew}>
              New
            </button>
            <button type="button" className="text-[11px] text-white/50 hover:text-white" onClick={() => void exportServers()}>
              Export
            </button>
            <button type="button" className="text-[11px] text-white/50 hover:text-white" onClick={() => void importServers()}>
              Import
            </button>
            <button type="button" className="text-[11px] text-white/50 hover:text-white" onClick={() => void importSshConfig()}>
              SSH config
            </button>
          </div>
        </div>
        {sessions.length ? (
          <ul className="space-y-1">
            {sessions.map((session) => (
              <li key={session.id}>
                <div
                  className={`flex items-center gap-1 rounded-md ${
                    selectedId === session.id ? 'bg-white/12' : 'hover:bg-white/8'
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm"
                    disabled={busy}
                    onClick={() => chooseSaved(session)}
                    onDoubleClick={() => void connectSaved(session)}
                  >
                    <div className="truncate font-medium">
                      {session.name}
                      {vaultReady && vaultSecretsFor(session.id) ? (
                        <span className="ml-1 text-[10px] font-normal text-white/35">saved password</span>
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-white/45">
                      {session.username}@{session.host}
                      {session.jump ? ' via jump' : ''}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="px-1.5 text-[11px] font-semibold text-accent-fg hover:text-white disabled:opacity-40"
                    disabled={busy}
                    onClick={() => void connectSaved(session)}
                  >
                    Go
                  </button>
                  <button
                    type="button"
                    className="px-2 text-white/35 hover:text-white"
                    aria-label={`Delete ${session.name}`}
                    onClick={() => removeSaved(session.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 py-6 text-center text-xs leading-5 text-white/40">
            No saved servers yet. Fill in the host and Connect, or Import a list from another computer. Help (F1) explains keys, vault, and forwarding.
          </p>
        )}
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Password vault</div>
          {vaultReady ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="text-emerald-300">Unlocked</span>
              <button type="button" className="text-white/50 hover:text-white" onClick={() => lockVault()}>
                Lock
              </button>
              <button type="button" className="text-white/50 hover:text-white" onClick={() => setVaultMode('change')}>
                Change
              </button>
              <button type="button" className="text-white/50 hover:text-white" onClick={() => setVaultMode('forget')}>
                Forget
              </button>
            </div>
          ) : vaultExists ? (
            <button type="button" className="mt-1.5 text-[11px] font-semibold text-accent-fg hover:text-white" onClick={() => setVaultMode('unlock')}>
              Unlock to fill saved passwords
            </button>
          ) : (
            <button type="button" className="mt-1.5 text-[11px] font-semibold text-accent-fg hover:text-white" onClick={() => setVaultMode('create')}>
              Set master password
            </button>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center gap-3">
          <img src="./icon.svg" alt="" className="h-10 w-10 shrink-0 rounded-[10px]" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">{overlay ? 'Add server' : APP_NAME}</h1>
            <p className="text-xs leading-5 text-white/50">Your Linux VPS over SSH — files, editor, and a real shell</p>
          </div>
          <button type="button" className="ml-auto shrink-0 text-xs font-semibold text-white/50 hover:text-white" onClick={openHelp}>
            Help
          </button>
        </div>
        {formCard}
      </div>
    </div>
  )

  const vaultDialog = vaultMode ? (
    <VaultDialog
      mode={vaultMode}
      busy={vaultBusy}
      onCancel={() => {
        wantSecrets.current = false
        pendingConnect.current = null
        setVaultMode(null)
      }}
      onCreate={async (password) => {
        setVaultBusy(true)
        try {
          await createMasterPassword(password)
          await finishVaultOpen()
        } finally {
          setVaultBusy(false)
        }
      }}
      onUnlock={async (password) => {
        setVaultBusy(true)
        try {
          await unlockVault(password)
          await finishVaultOpen()
        } finally {
          setVaultBusy(false)
        }
      }}
      onChange={async (current, next) => {
        setVaultBusy(true)
        try {
          await changeMasterPassword(current, next)
          setVaultMode(null)
        } finally {
          setVaultBusy(false)
        }
      }}
      onForget={() => {
        forgetVault()
        setRememberSecrets(false)
        localStorage.setItem(REMEMBER_SECRETS_KEY, '0')
        setVaultMode(null)
      }}
    />
  ) : null

  if (overlay) {
    return (
      <div className="absolute inset-0 z-40 flex min-h-0 flex-col bg-canvas/95">
        <div className="chrome-inset app-drag h-10 shrink-0 bg-chrome" />
        <div className="login-scroll app-no-drag relative min-h-0 flex-1">{body}</div>
        {vaultDialog}
        <HelpOverlay open={showHelp} onClose={closeHelp} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="chrome-inset app-drag h-10 shrink-0 bg-chrome" />
      <div className="login-scroll app-no-drag relative min-h-0 flex-1">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(61,99,221,0.18),_transparent_50%)]" />
        {body}
      </div>
      {vaultDialog}
      <HelpOverlay open={showHelp} onClose={closeHelp} />
    </div>
  )
}
