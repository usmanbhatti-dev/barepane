type Props = {
  kind: 'folder' | 'file' | 'link' | 'home' | 'disk' | 'search' | 'file-plus' | 'folder-plus' | 'upload' | 'download' | 'bookmark' | 'bookmark-on'
  className?: string
}

export default function Glyph({ kind, className = 'h-4 w-4' }: Props) {
  const common = `${className} shrink-0`
  if (kind === 'folder') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-amber-400`} fill="currentColor" aria-hidden>
        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3.1c.3 0 .6.1.8.3l.8.8c.2.2.5.3.8.3H12.5A1.5 1.5 0 0 1 14 5.9v5.6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
      </svg>
    )
  }
  if (kind === 'link') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-sky-300`} fill="currentColor" aria-hidden>
        <path d="M6.3 9.7a.75.75 0 0 1 0-1.06l2.4-2.4a2.2 2.2 0 1 1 3.1 3.1l-.7.7a.75.75 0 0 1-1.06-1.06l.7-.7a.7.7 0 1 0-1-1l-2.4 2.4a.75.75 0 0 1-1.04.02zM9.7 6.3a.75.75 0 0 1 0 1.06l-2.4 2.4a2.2 2.2 0 1 1-3.1-3.1l.7-.7a.75.75 0 0 1 1.06 1.06l-.7.7a.7.7 0 1 0 1 1l2.4-2.4a.75.75 0 0 1 1.04-.02z" />
      </svg>
    )
  }
  if (kind === 'home') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-ubuntu`} fill="currentColor" aria-hidden>
        <path d="M8 2.2 2.4 7.1a.8.8 0 0 0-.3.6V13a1 1 0 0 0 1 1h3.2V10h3.4v4H13a1 1 0 0 0 1-1V7.7a.8.8 0 0 0-.3-.6z" />
      </svg>
    )
  }
  if (kind === 'disk') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-white/55`} fill="currentColor" aria-hidden>
        <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v9A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5zm2 1h6v2H5zm3.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
      </svg>
    )
  }
  if (kind === 'search') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-white/50`} fill="currentColor" aria-hidden>
        <path d="M7 2.5a4.5 4.5 0 1 0 2.8 8.1l2.8 2.8a.75.75 0 0 0 1.06-1.06l-2.8-2.8A4.5 4.5 0 0 0 7 2.5zM4.5 7a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0z" />
      </svg>
    )
  }
  if (kind === 'file-plus') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-white/75`} fill="currentColor" aria-hidden>
        <path d="M4.5 2A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14H8v-1.5H4.5a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H8V6h3.5v1H13V6.2c0-.4-.2-.8-.4-1.1L9.9 2.4A1.5 1.5 0 0 0 8.8 2zM9 3.2 11.8 6H9.5A.5.5 0 0 1 9 5.5z" />
        <path d="M12.25 9a.75.75 0 0 1 .75.75V11h1.25a.75.75 0 0 1 0 1.5H13v1.25a.75.75 0 0 1-1.5 0V12.5H10.25a.75.75 0 0 1 0-1.5H11.5v-1.25A.75.75 0 0 1 12.25 9z" />
      </svg>
    )
  }
  if (kind === 'folder-plus') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-white/75`} fill="currentColor" aria-hidden>
        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3.1c.3 0 .6.1.8.3l.8.8c.2.2.5.3.8.3H12.5A1.5 1.5 0 0 1 14 5.9V8h-1.5V5.9a.5.5 0 0 0-.5-.4H8.2a2 2 0 0 1-1.3-.5l-.7-.7H3.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H8V13H3.5A1.5 1.5 0 0 1 2 11.5z" />
        <path d="M12.25 9a.75.75 0 0 1 .75.75V11h1.25a.75.75 0 0 1 0 1.5H13v1.25a.75.75 0 0 1-1.5 0V12.5H10.25a.75.75 0 0 1 0-1.5H11.5v-1.25A.75.75 0 0 1 12.25 9z" />
      </svg>
    )
  }
  if (kind === 'upload') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-white/75`} fill="currentColor" aria-hidden>
        <path d="M8 13.5a.75.75 0 0 1-.75-.75V6.56L5.53 8.28a.75.75 0 0 1-1.06-1.06l3.5-3.5a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 1 1-1.06 1.06L8.75 6.56v6.19a.75.75 0 0 1-.75.75z" />
        <path d="M3.25 2.5h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1 0-1.5z" />
      </svg>
    )
  }
  if (kind === 'download') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-white/75`} fill="currentColor" aria-hidden>
        <path d="M8 2.5a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l1.72 1.72V3.25A.75.75 0 0 1 8 2.5z" />
        <path d="M3.25 12h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1 0-1.5z" />
      </svg>
    )
  }
  if (kind === 'bookmark-on') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-ubuntu`} fill="currentColor" aria-hidden>
        <path d="M4 2.75A1.75 1.75 0 0 1 5.75 1h4.5A1.75 1.75 0 0 1 12 2.75v11.4a.75.75 0 0 1-1.16.63L8 12.4l-2.84 2.38A.75.75 0 0 1 4 14.15z" />
      </svg>
    )
  }
  if (kind === 'bookmark') {
    return (
      <svg viewBox="0 0 16 16" className={`${common} text-white/75`} fill="currentColor" aria-hidden>
        <path d="M5.75 2.5A.25.25 0 0 0 5.5 2.75v9.86l2.14-1.8a.75.75 0 0 1 .72 0l2.14 1.8V2.75a.25.25 0 0 0-.25-.25h-4.5zM4 2.75A1.75 1.75 0 0 1 5.75 1h4.5A1.75 1.75 0 0 1 12 2.75v11.4a.75.75 0 0 1-1.16.63L8 12.4l-2.84 2.38A.75.75 0 0 1 4 14.15z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className={`${common} text-white/70`} fill="currentColor" aria-hidden>
      <path d="M4.5 2A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5V6.2c0-.4-.2-.8-.4-1.1L9.9 2.4A1.5 1.5 0 0 0 8.8 2zM9 3.2 11.8 6H9.5A.5.5 0 0 1 9 5.5z" />
    </svg>
  )
}
