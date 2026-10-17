import type { RemoteFile } from '@shared/types'
import { MAX_EDIT_BYTES } from '@shared/limits'

export { MAX_EDIT_BYTES }

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tif', 'tiff', 'heic',
  'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'tar', 'zst',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'so', 'o', 'a', 'dylib', 'dll', 'exe', 'bin', 'class', 'pyc', 'pyo', 'wasm',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi', 'mkv', 'flac',
  'sqlite', 'db', 'dmg', 'iso', 'img', 'deb', 'rpm', 'apk',
])

export function fileExtension(name: string): string {
  const base = name.split('/').pop() || name
  if (base.startsWith('.') && !base.slice(1).includes('.')) return ''
  const index = base.lastIndexOf('.')
  if (index <= 0) return ''
  return base.slice(index + 1).toLowerCase()
}

export function isEditable(file: RemoteFile): boolean {
  if (file.isDirectory) return false
  const ext = fileExtension(file.name)
  if (!ext) return true
  return !BINARY_EXTENSIONS.has(ext)
}

export function looksBinary(content: string): boolean {
  if (!content) return false
  const sample = content.slice(0, 8192)
  if (sample.includes('\0')) return true
  let control = 0
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i)
    if (code === 9 || code === 10 || code === 13) continue
    if (code < 32 || code === 127 || code === 0xfffd) control += 1
  }
  return control / sample.length > 0.3
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function formatTime(timestamp: number): string {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function lineCount(content: string): number {
  if (!content) return 1
  return content.split('\n').length
}
