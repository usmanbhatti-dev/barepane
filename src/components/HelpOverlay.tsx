import { useEffect } from 'react'
import { APP_NAME } from '@shared/brand'
import AboutPanel from './AboutPanel'

type Props = {
  open: boolean
  onClose: () => void
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'F1', action: 'Open or close this help' },
  { keys: '⌘/Ctrl S', action: 'Save the file you are editing' },
  { keys: '⌘/Ctrl W', action: 'Close the editor tab (when the editor is focused)' },
  { keys: '⌘/Ctrl F', action: 'Find in the file list, editor, or terminal' },
  { keys: '⌘/Ctrl C · ⌘/Ctrl V', action: 'Copy or paste in the terminal (Ctrl+C copies if text is selected)' },
  { keys: '⌘/Ctrl K', action: 'Command palette' },
  { keys: '⌘/Ctrl ⌥ G', action: 'Go to line in the editor' },
  { keys: '⌘/Ctrl N', action: 'New file (file pane focused)' },
  { keys: '⌘/Ctrl A', action: 'Select all files in the current list' },
  { keys: 'F2 / Del', action: 'Rename or delete the selected file' },
  { keys: 'Enter', action: 'Open a file or folder' },
  { keys: 'Esc', action: 'Close help, find, or a panel' },
]

export function useHelpHotkey(open: boolean, onOpen: () => void, onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'F1') {
        event.preventDefault()
        event.stopPropagation()
        if (open) onClose()
        else onOpen()
        return
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpen, onClose, enabled])
}

export default function HelpOverlay({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4" onMouseDown={onClose}>
      <div
        className="max-h-[min(36rem,88vh)] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-surface p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="help-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="help-title" className="text-base font-semibold">
              How {APP_NAME} works
            </h2>
            <p className="mt-1 text-sm leading-6 text-white/65">
              This is a desktop SSH workstation for your Linux VPS: files, a tabbed editor, and a real shell in one window. Nothing is installed on the server. It is not a website and not remote desktop.
            </p>
          </div>
          <button type="button" className="ui-btn shrink-0" onClick={onClose}>
            Close
          </button>
        </div>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-white/75">
          <li>Connect with password, SSH key (including AWS <span className="font-mono text-white/80">.pem</span>), or ssh-agent. Double-click a saved server (or Go) to connect. Import <span className="font-mono text-white/80">~/.ssh/config</span> from the saved list. If the SSH link drops, the app reconnects and restores tunnels.</li>
          <li>Browse with SFTP. Expand folders in the left tree (arrow), or type in Find folders. Search can be file names or text inside files. Permission denied on /etc or /var/www asks for sudo — that password stays in memory only.</li>
          <li>Edit and ⌘S / Ctrl+S. Use <strong>Editor</strong> in the title bar to hide the file tree and terminal so the file fills the window. Wrap toggles long lines. Click a path segment to open that folder. If the file changed on the server, you get a warning before overwrite. Use Site for nginx test/reload and PHP-FPM.</li>
          <li>Tunnels listen on 127.0.0.1 only. Health shows load, memory, disks, inodes, failed services, and top processes. If a kernel update left <span className="font-mono text-white/80">/var/run/reboot-required</span>, Health says so and has <strong>Reboot</strong> (asks first; needs sudo). Apps is a one-shot snapshot of ports, stacks, nginx sites, PM2, Compose (up/down/restart), and a security glance — it does not poll. If Grafana or Prometheus is listening, Tunnel & open uses a local tunnel and your browser. Logs follow journalctl, a file, or Docker. Services start/stop systemd. Docker is a Refresh snapshot of containers, images, and volumes; click a container for CPU/memory limits and a one-shot stats line.</li>
        </ol>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/45">Moving to another computer</h3>
        <p className="mt-1 text-sm leading-6 text-white/65">
          On the login screen, Export saved servers writes host, user, port, and key <em>path</em> to a JSON file. Import that file on another machine. Passwords are never in that file — unlock the vault on each computer if you store them.
        </p>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/45">Agent forwarding</h3>
        <p className="mt-1 text-sm leading-6 text-white/65">
          Turn on <strong>Forward agent</strong> only if you trust this server. It lets the remote machine use your local ssh-agent (for example <span className="font-mono text-white/80">git@github.com</span> or a second hop). OpenSSH certificates work if they are already loaded in the agent (<span className="font-mono text-white/80">ssh-add</span>).
        </p>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-white/45">Shortcuts</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {SHORTCUTS.map((item) => (
            <li key={item.keys} className="flex gap-3">
              <span className="w-28 shrink-0 font-mono text-[11px] text-white/45">{item.keys}</span>
              <span className="text-white/70">{item.action}</span>
            </li>
          ))}
        </ul>
        <AboutPanel />
      </div>
    </div>
  )
}
