import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MAX_COMMAND, MAX_NAME, type CommandSnippet } from '@shared/snippets'

type Props = {
  snippet?: CommandSnippet | null
  onCancel: () => void
  onSave: (snippet: CommandSnippet) => void
}

export default function SnippetDialog({ snippet, onCancel, onSave }: Props) {
  const [name, setName] = useState(snippet?.name ?? '')
  const [command, setCommand] = useState(snippet?.command ?? '')
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function submit(event: FormEvent) {
    event.preventDefault()
    const nextName = name.trim()
    const nextCommand = command.replace(/^\s+|\s+$/g, '')
    if (!nextName || !nextCommand) {
      setError('Name and command are required.')
      return
    }
    if (nextName.length > MAX_NAME) {
      setError(`Name must be ${MAX_NAME} characters or less.`)
      return
    }
    if (nextCommand.length > MAX_COMMAND) {
      setError('Command is too long.')
      return
    }
    onSave({
      id: snippet?.id || crypto.randomUUID(),
      name: nextName,
      command: nextCommand,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4" onMouseDown={onCancel}>
      <form
        className="w-full max-w-md rounded-xl border border-white/10 bg-surface p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-base font-semibold">{snippet ? 'Edit snippet' : 'New snippet'}</h2>
        <p className="mt-1 text-xs text-white/45">Stored on this computer. Do not put passwords in commands.</p>
        <label className="mt-3 block">
          <span className="ui-label">Name</span>
          <input
            ref={nameRef}
            value={name}
            maxLength={MAX_NAME}
            onChange={(event) => setName(event.target.value)}
            placeholder="Restart nginx"
            className="ui-input"
          />
        </label>
        <label className="mt-3 block">
          <span className="ui-label">Command</span>
          <textarea
            value={command}
            maxLength={MAX_COMMAND}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="sudo systemctl restart nginx"
            rows={4}
            className="ui-input min-h-24 resize-y font-mono text-[13px]"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold hover:bg-accent-hover">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
