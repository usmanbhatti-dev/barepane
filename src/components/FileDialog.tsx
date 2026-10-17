import { useEffect, useRef, useState } from 'react'

type Props = {
  title: string
  message?: string
  error?: string
  confirmLabel: string
  danger?: boolean
  input?: boolean
  secret?: boolean
  defaultValue?: string
  placeholder?: string
  onCancel: () => void
  onConfirm: (value: string) => void
}

export default function FileDialog({
  title,
  message,
  error,
  confirmLabel,
  danger,
  input,
  secret,
  defaultValue = '',
  placeholder,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className={`fixed inset-0 ${secret ? 'z-[80]' : 'z-50'} flex items-center justify-center bg-black/55 px-4`} onMouseDown={onCancel}>
      <form
        className="w-full max-w-sm rounded-xl border border-white/10 bg-surface p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (input && !(secret ? value : value.trim())) return
          onConfirm(input ? (secret ? value : value.trim()) : '')
        }}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        {message ? <p className="mt-2 text-sm leading-6 text-white/70">{message}</p> : null}
        {input ? (
          <input
            ref={inputRef}
            type={secret ? 'password' : 'text'}
            autoComplete={secret ? 'off' : undefined}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
            className="ui-input mt-3"
          />
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="ui-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${danger ? 'bg-red-600 hover:bg-red-500' : 'ui-btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
