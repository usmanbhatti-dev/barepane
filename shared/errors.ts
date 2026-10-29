export function formatSshError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error)
  message = message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
  const lower = message.toLowerCase()

  if (lower.includes('authentication') || lower.includes('auth fail') || lower.includes('all configured') || lower.includes('no matching')) {
    return 'Login failed. Check the user, password, or SSH key. Many VPSs only accept keys.'
  }
  if ((lower.includes('encrypted') && lower.includes('key')) || lower.includes('no passphrase given') || lower.includes('key is locked')) {
    return 'This SSH key is locked. Enter the key passphrase (set on your computer when the key was created), not the server password. If ssh-agent already has the key, leave passphrase empty.'
  }
  if (lower.includes('cannot parse private key') || lower.includes('invalid private key')) {
    return 'That SSH key file could not be read. Use a private key (.pem from AWS, or OpenSSH). This is not the .pub file.'
  }
  if (lower.includes('host key was not trusted') || lower.includes('host key changed')) {
    return message.replace(/^Error:\s*/i, '')
  }
  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('timedout')) {
    return 'Connection timed out. Check the IP, port, jump host, and that the VPS is online.'
  }
  if (lower.includes('eaddrinuse') || lower.includes('address already in use')) {
    return 'That local port is already in use.'
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo') || lower.includes('err_name')) {
    return 'Host not found. Check the hostname or IP address.'
  }
  if (lower.includes('ehostunreach') || lower.includes('network is unreachable') || lower.includes('enonet')) {
    return 'Host is unreachable. Check the network and IP address.'
  }
  if (lower.includes('sudo password incorrect')) {
    return 'Sudo password incorrect.'
  }
  if (lower.includes('sudo password required')) {
    return 'Sudo password required.'
  }
  if (lower.includes('cannot use sudo') || lower.includes('not in the sudoers')) {
    return 'This user cannot use sudo.'
  }
  if (lower.includes('permission denied')) {
    return 'Permission denied. Your SSH user cannot access this path.'
  }
  if (lower.includes('no such file')) {
    return 'That path does not exist.'
  }
  if (lower.includes('no longer connected') || lower.includes('missing ssh session')) {
    return 'Disconnected from the server.'
  }
  if (lower.includes('not connected')) {
    return 'Disconnected from the server.'
  }
  if (lower.includes('is a directory')) {
    return 'That path is a folder.'
  }
  return message.replace(/^Error:\s*/i, '')
}

export function isExpectedDisconnect(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('no longer connected') ||
    message.includes('not connected') ||
    message.includes('missing ssh session') ||
    message.includes('connection lost') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  )
}

export function isSudoPasswordRequired(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('sudo password required') || lower.includes('permission denied')
}

export function isSudoPasswordIncorrect(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('sudo password incorrect')
}
