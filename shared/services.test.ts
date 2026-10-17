import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContainerCommand,
  buildUnitCommand,
  parseContainerName,
  parseDockerPs,
  parseSystemctlList,
  parseUnitName,
} from './services.ts'

const SYSTEMCTL = `
  cron.service          loaded active running Regular background program processing daemon
  nginx.service         loaded active running A high performance web server
● failed-job.service    loaded failed failed  Example failed unit
  user@1000.service     loaded active running User Manager for UID 1000
LOAD   ACTIVE SUB
3 loaded units listed.
nginx.service; rm -rf /    loaded active running nope
`

const DOCKER = `
a1b2c3d4e5f6\tnginx\tnginx:latest\tUp 2 hours\t0.0.0.0:80->80/tcp
bbccddeeff00\tapp_web_1\tghcr.io/acme/app:1.2\tExited (0) 3 days ago\t
bad;id\tbad;name\timage\tUp\t
`

test('parses systemctl list-units', () => {
  const units = parseSystemctlList(SYSTEMCTL)
  assert.equal(units.length, 4)
  assert.equal(units[0]?.name, 'cron.service')
  assert.equal(units[1]?.active, 'active')
  assert.equal(units[2]?.name, 'failed-job.service')
  assert.equal(units[2]?.active, 'failed')
  assert.equal(units[3]?.name, 'user@1000.service')
})

test('parses docker ps table', () => {
  const list = parseDockerPs(DOCKER)
  assert.equal(list.length, 2)
  assert.equal(list[0]?.name, 'nginx')
  assert.equal(list[0]?.ports, '0.0.0.0:80->80/tcp')
  assert.equal(list[1]?.status, 'Exited (0) 3 days ago')
})

test('rejects unsafe names and quotes actions', () => {
  assert.throws(() => parseUnitName('nginx; reboot'))
  assert.throws(() => parseContainerName('foo bar'))
  assert.equal(buildUnitCommand('restart', 'nginx.service'), `systemctl restart 'nginx.service'`)
  assert.equal(buildContainerCommand('stop', 'web_1'), `docker stop 'web_1'`)
  assert.throws(() => buildUnitCommand('restart', "nginx' && reboot"))
})
