import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContainerCommand,
  buildContainerInspectCommand,
  buildUnitCommand,
  formatCpuLimit,
  formatMemoryLimit,
  parseContainerName,
  parseDockerImages,
  parseDockerInspect,
  parseDockerInventory,
  parseDockerPs,
  parseDockerVolumes,
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
  assert.match(buildContainerInspectCommand('web_1'), /docker inspect --format .* 'web_1'/)
  assert.throws(() => buildUnitCommand('restart', "nginx' && reboot"))
  assert.throws(() => buildContainerInspectCommand('web; rm'))
})

test('parses docker images and volumes', () => {
  const images = parseDockerImages(`
a1b2c3d4e5f6\tnginx\tlatest\t142MB\t2 weeks ago
sha256:bbccddeeff0011223344\tghcr.io/acme/app\t1.2\t80MB\t3 days ago
not-an-id\tskip\tlatest\t1B\tnow
`)
  assert.equal(images.length, 2)
  assert.equal(images[0]?.repository, 'nginx')
  assert.equal(images[0]?.size, '142MB')
  assert.equal(images[1]?.id, 'bbccddeeff00')

  const volumes = parseDockerVolumes(`
shop_data\tlocal\t/var/lib/docker/volumes/shop_data/_data
bad name\tlocal\t/tmp
`)
  assert.equal(volumes.length, 1)
  assert.equal(volumes[0]?.name, 'shop_data')
})

test('parses a docker inventory snapshot', () => {
  const inv = parseDockerInventory(`
BEGIN_PS
a1b2c3d4e5f6\tnginx\tnginx:latest\tUp 2 hours\t80/tcp
END_PS
BEGIN_IMAGES
a1b2c3d4e5f6\tnginx\tlatest\t142MB\t2 weeks ago
END_IMAGES
BEGIN_VOLUMES
shop_data\tlocal\t/var/lib/docker/volumes/shop_data/_data
END_VOLUMES
`)
  assert.equal(inv.containers[0]?.name, 'nginx')
  assert.equal(inv.images[0]?.tag, 'latest')
  assert.equal(inv.volumes[0]?.driver, 'local')
  assert.equal(parseDockerInventory('bash: docker: command not found').missing, true)
  assert.equal(parseDockerInventory('Cannot connect to the Docker daemon').daemon, true)
})

test('parses inspect limits and one-shot stats', () => {
  assert.equal(formatCpuLimit(0), 'unlimited')
  assert.equal(formatCpuLimit(2e9), '2 CPU')
  assert.equal(formatMemoryLimit(512 * 1048576), '512 MB')
  const info = parseDockerInspect(
    `
BEGIN_INSPECT
1000000000\t536870912
END_INSPECT
BEGIN_STATS
1.24%\t40MiB / 512MiB\t7.81%
END_STATS
`,
    'nginx',
  )
  assert.equal(info.cpuLimit, '1 CPU')
  assert.equal(info.memoryLimit, '512 MB')
  assert.equal(info.cpuPercent, '1.24%')
  assert.equal(info.memoryUsage, '40MiB / 512MiB')
})
