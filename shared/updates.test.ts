import assert from 'node:assert/strict'
import test from 'node:test'
import { EXTERNAL_LINKS, externalLinkUrl, isExternalLinkId } from './links.ts'
import { describeUpdate, friendlyUpdateError, shouldAutoCheck, shouldShowBanner } from './updates.ts'

test('external links are an allow-list of https URLs', () => {
  for (const [id, url] of Object.entries(EXTERNAL_LINKS)) {
    assert.ok(isExternalLinkId(id))
    assert.match(url, /^https:\/\//, `${id} must be https`)
  }
  assert.equal(externalLinkUrl('releases'), EXTERNAL_LINKS.releases)
})

test('external links reject anything that is not a known id', () => {
  assert.equal(isExternalLinkId('https://evil.example'), false)
  assert.equal(isExternalLinkId('__proto__'), false)
  assert.equal(isExternalLinkId('constructor'), false)
  assert.equal(isExternalLinkId(42), false)
  assert.throws(() => externalLinkUrl('file:///etc/passwd'), /Unknown link/)
})

test('updater errors become actionable messages', () => {
  assert.match(friendlyUpdateError(new Error('getaddrinfo ENOTFOUND github.com')), /internet connection/)
  assert.match(friendlyUpdateError(new Error('net::ERR_INTERNET_DISCONNECTED')), /internet connection/)
  assert.match(friendlyUpdateError(new Error('HTTP 404 Not Found')), /releases page/)
  assert.match(friendlyUpdateError(new Error('HTTP 403 rate limit exceeded')), /rate-limiting/)
  assert.match(friendlyUpdateError(new Error('Code signature at URL did not pass validation')), /releases page/)
  assert.match(friendlyUpdateError(new Error('sha512 checksum mismatch')), /integrity/)
  assert.match(friendlyUpdateError('something odd'), /releases page/)
})

test('friendly errors never leak raw error text', () => {
  const message = friendlyUpdateError(new Error('token ghp_secret failed at /Users/me/path'))
  assert.equal(message.includes('ghp_secret'), false)
  assert.equal(message.includes('/Users/me'), false)
})

test('update state is described for the About panel', () => {
  assert.equal(describeUpdate({ status: 'none' }), 'You are on the latest version.')
  assert.equal(describeUpdate({ status: 'available', version: '1.2.0' }), 'Version 1.2.0 is available.')
  assert.equal(describeUpdate({ status: 'downloading', version: '1.2.0', percent: 41.6 }), 'Downloading version 1.2.0… 42%')
  assert.match(describeUpdate({ status: 'ready', version: '1.2.0' }), /Restart Barepane/)
  assert.equal(describeUpdate({ status: 'error', message: 'boom' }), 'boom')
  assert.match(describeUpdate({ status: 'unsupported' }), /not available/)
})

test('banner shows only for actionable states', () => {
  assert.equal(shouldShowBanner({ status: 'idle' }), false)
  assert.equal(shouldShowBanner({ status: 'checking' }), false)
  assert.equal(shouldShowBanner({ status: 'none' }), false)
  assert.equal(shouldShowBanner({ status: 'available', version: '2.0.0' }), true)
  assert.equal(shouldShowBanner({ status: 'downloading', percent: 3 }), true)
  assert.equal(shouldShowBanner({ status: 'ready', version: '2.0.0' }), true)
  assert.equal(shouldShowBanner({ status: 'error', message: 'x' }), false)
  // a failed check is reported in About / the menu dialog, not the banner
  assert.equal(shouldShowBanner({ status: 'error', message: 'x', userInitiated: true }), false)
  // a failed download of a known version is
  assert.equal(shouldShowBanner({ status: 'error', message: 'x', userInitiated: true, version: '2.0.0' }), true)
})

test('background checks respect the opt-out and unsupported installs', () => {
  assert.equal(shouldAutoCheck({ enabled: true, supported: true, busy: false }), true)
  assert.equal(shouldAutoCheck({ enabled: false, supported: true, busy: false }), false)
  assert.equal(shouldAutoCheck({ enabled: true, supported: false, busy: false }), false)
  assert.equal(shouldAutoCheck({ enabled: true, supported: true, busy: true }), false)
})
