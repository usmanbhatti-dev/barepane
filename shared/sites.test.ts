import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSiteCommand, parseSiteAction, SITES_ENABLED } from './sites.ts'

test('site actions map to safe commands', () => {
  assert.equal(parseSiteAction('nginx-test'), 'nginx-test')
  assert.match(buildSiteCommand('nginx-test'), /nginx -t/)
  assert.match(buildSiteCommand('nginx-reload'), /systemctl reload nginx/)
  assert.match(buildSiteCommand('php-reload'), /php\*-fpm/)
  assert.equal(SITES_ENABLED, '/etc/nginx/sites-enabled')
  assert.throws(() => parseSiteAction('rm -rf'), /Unknown/)
})
