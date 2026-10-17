import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MIN_MASTER_PASSWORD } from '@shared/vault'

type Mode = 'create' | 'unlock' | 'change' | 'forget'

type Props = {
  mode: Mode
  error?: string
  busy?: boolean
  onCancel: () => void
  onCreate: (password: string) => Promise<void> | void
  onUnlock: (password: string) => Promise<void> | void
  onChange: (current: string, next: string) => Promise<void> | void
  onForget: () => void
}

const COPY: Record<Mode, { title: string; message: string; confirm: string }> = {
  create: {
    title: 'Set master password',
    message: `This encrypts saved SSH passwords on this computer. Use at least ${MIN_MASTER_PASSWORD} characters. If you forget it, those passwords cannot be recovered.`,
    confirm: 'Create vault',
  },
  unlock: {
    title: 'Unlock vault',
    message: 'Enter your master password to fill saved login passwords.',
    confirm: 'Unlock',
  },
  change: {
    title: 'Change master password',
    message: 'The vault is re-encrypted. Saved servers stay as they are.',
    confirm: 'Change',
  },
  forget: {
    title: 'Forget vault',
    message: 'This deletes saved SSH passwords on this computer. Server names, hosts, and key paths are kept.',
    confirm: 'Delete passwords',
  },
}

export default function VaultDialog({ mode, error, busy, onCancel, onCreate, onUnlock, onChange, onForget }: Props) {
  const [password, setPassword] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')
  const firstRef = useRef<HTMLInputElement | null>(null)
  const copy = COPY[mode]

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, mode])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError('')
    try {
      if (mode === 'create') {
        if (password.length < MIN_MASTER_PASSWORD) {
          setLocalError(`Use at least ${MIN_MASTER_PASSWORD} characters.`)
          return
        }
        if (password !== confirm) {
          setLocalError('The two passwords do not match.')
          return
        }
        await onCreate(password)
        return
      }
      if (mode === 'unlock') {
        await onUnlock(password)
        return
      }
      if (mode === 'change') {
        if (next.length < MIN_MASTER_PASSWORD) {
          setLocalError(`Use at least ${MIN_MASTER_PASSWORD} characters.`)
          return
        }
        if (next !== confirm) {
          setLocalError('The two new passwords do not match.')
          return
        }
        await onChange(password, next)
        return
      }
      onForget()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4" onMouseDown={onCancel}>
      <form
        className="w-full max-w-sm rounded-xl border border-white/10 bg-[#2a2a2a] p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <h2 className="text-base font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-white/70">{copy.message}</p>
        {mode === 'unlock' || mode === 'create' || mode === 'change' ? (
          <label className="mt-3 block">
            <span className="ui-label">{mode === 'change' ? 'Current password' : 'Master password'}</span>
            <input
              ref={firstRef}
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="ui-input"
            />
          </label>
        ) : null}
        {mode === 'create' || mode === 'change' ? (
          <>
            {mode === 'change' ? (
              <label className="mt-3 block">
                <span className="ui-label">New password</span>
                <input type="password" autoComplete="off" value={next} onChange={(event) => setNext(event.target.value)} className="ui-input" />
              </label>
            ) : null}
            <label className="mt-3 block">
              <span className="ui-label">{mode === 'change' ? 'Confirm new password' : 'Confirm password'}</span>
              <input
                type="password"
                autoComplete="off"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="ui-input"
              />
            </label>
          </>
        ) : null}
        {localError || error ? <p className="mt-2 text-sm text-red-300">{localError || error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="ui-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              mode === 'forget' ? 'bg-red-600 hover:bg-red-500' : 'ui-btn-primary'
            }`}
          >
            {busy ? 'Working…' : copy.confirm}
          </button>
        </div>
      </form>
    </div>
  )
}
