import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { shellQuote } from '@shared/paths'
import type { CommandSnippet } from '@shared/snippets'
import { deleteSnippet, loadSnippets, upsertSnippet } from '../lib/snippetStore'
import FileContextMenu, { type MenuItem } from './FileContextMenu'
import SnippetDialog from './SnippetDialog'

type Props = {
  cwd: string
  canBroadcast?: boolean
  onRun: (command: string) => void
  onRunAllShells: (command: string) => void
  onRunAllServers?: (command: string) => void
}

export default function SnippetBar({ cwd, canBroadcast, onRun, onRunAllShells, onRunAllServers }: Props) {
  const [snippets, setSnippets] = useState<CommandSnippet[]>(() => loadSnippets())
  const [editing, setEditing] = useState<CommandSnippet | null | undefined>(undefined)
  const [menu, setMenu] = useState<{ x: number; y: number; snippet: CommandSnippet } | null>(null)

  function save(next: CommandSnippet) {
    setSnippets(upsertSnippet(next))
    setEditing(undefined)
  }

  function remove(id: string) {
    setSnippets(deleteSnippet(id))
  }

  function openMenu(event: ReactMouseEvent, snippet: CommandSnippet) {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, snippet })
  }

  const menuItems: MenuItem[] = menu
    ? [
        { label: 'Run', onClick: () => onRun(menu.snippet.command) },
        { label: 'Run on all shells', onClick: () => onRunAllShells(menu.snippet.command) },
        ...(canBroadcast && onRunAllServers
          ? ([{ label: 'Run on all servers', onClick: () => onRunAllServers(menu.snippet.command) }] satisfies MenuItem[])
          : []),
        'separator',
        { label: 'Edit', onClick: () => setEditing(menu.snippet) },
        { label: 'Delete', danger: true, onClick: () => remove(menu.snippet.id) },
      ]
    : []

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {snippets.map((snippet) => (
        <button
          key={snippet.id}
          type="button"
          title={snippet.command}
          onClick={() => onRun(snippet.command)}
          onContextMenu={(event) => openMenu(event, snippet)}
          className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-ubuntu"
        >
          {snippet.name}
        </button>
      ))}
      <button
        type="button"
        className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-ubuntu"
        onClick={() => onRun(`cd ${shellQuote(cwd)}`)}
      >
        Jump to files
      </button>
      <button
        type="button"
        className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-ubuntu"
        onClick={() => setEditing(null)}
      >
        Add
      </button>
      {menu ? <FileContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} /> : null}
      {editing !== undefined ? (
        <SnippetDialog snippet={editing} onCancel={() => setEditing(undefined)} onSave={save} />
      ) : null}
    </div>
  )
}
