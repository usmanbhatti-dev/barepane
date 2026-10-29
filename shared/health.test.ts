import assert from 'node:assert/strict'
import test from 'node:test'
import { assessHealth, parseHealth, REBOOT_COMMAND } from './health.ts'

const SAMPLE = `
HOST=web-1
OS=Ubuntu 24.04.3 LTS
KERNEL=6.8.0-71-generic
ARCH=x86_64
VIRT=kvm
UPTIME=up 12 days, 4 hours
TIME=2026-09-01 21:40 UTC
IPS=203.0.113.10 10.0.0.8
CPU=2
CPU_MODEL=DO-Regular
LOAD=2.50 1.10 0.40
MEM=1700 2000 180
SWAP=0 0
REBOOT=yes
USERS=2
FAILED=nginx.service,cron.service,foo.service,bar.service
BEGIN_DISKS
/\t40G\t39G\t1.0G\t97
/mnt/data\t200G\t20G\t180G\t10
END_DISKS
BEGIN_INODES
/\t91
/mnt/data\t4
END_INODES
BEGIN_PROCS
root\t1\t0.0\t0.1\tsystemd
www-data\t882\t42.1\t12.5\tnginx
ubuntu\t1204\t3.2\t1.1\tnode
END_PROCS
`

test('parses VPS health details', () => {
  const stats = parseHealth(SAMPLE)
  assert.equal(stats.hostname, 'web-1')
  assert.equal(stats.os, 'Ubuntu 24.04.3 LTS')
  assert.equal(stats.cpuCount, 2)
  assert.equal(stats.load1, 2.5)
  assert.equal(stats.memUsedMb, 1700)
  assert.equal(stats.memTotalMb, 2000)
  assert.equal(stats.rebootRequired, true)
  assert.equal(stats.users, 2)
  assert.deepEqual(stats.ips, ['203.0.113.10', '10.0.0.8'])
  assert.equal(stats.disks[0]?.mount, '/')
  assert.equal(stats.disks[0]?.percent, 97)
  assert.equal(stats.disks[0]?.inodePercent, 91)
  assert.equal(stats.failedUnits, 4)
  assert.equal(stats.processes[1]?.command, 'nginx')
  assert.equal(stats.memory, '1700/2000 MB')
  assert.equal(stats.disk, '39G/40G')
})

test('flags load, disk, memory, reboot, and failed units', () => {
  const stats = parseHealth(SAMPLE)
  const health = assessHealth(stats)
  assert.equal(health.load, 'bad')
  assert.equal(health.memory, 'warn')
  assert.equal(health.disk, 'bad')
  assert.equal(health.overall, 'bad')
  assert.ok(health.notes.some((note) => /reboot/i.test(note)))
  assert.equal(REBOOT_COMMAND, 'systemctl reboot')
  assert.ok(health.notes.some((note) => /failed/i.test(note)))
  assert.ok(health.notes.some((note) => /inodes/i.test(note)))
})

test('inode pressure alone is a disk warning', () => {
  const health = assessHealth({
    cpuCount: 2,
    load1: 0.1,
    memUsedMb: 200,
    memTotalMb: 2000,
    disks: [{ mount: '/', size: '40G', used: '10G', avail: '30G', percent: 25, inodePercent: 96 }],
    failedUnits: 0,
    rebootRequired: false,
  })
  assert.equal(health.disk, 'bad')
  assert.equal(health.overall, 'bad')
  assert.ok(health.notes.some((note) => /96% of inodes/.test(note)))
  assert.equal(health.notes.some((note) => /full/.test(note)), false)
})

test('healthy sample stays ok', () => {
  const stats = parseHealth(`
HOST=ok
CPU=4
LOAD=0.20 0.10 0.05
MEM=400 2000 1500
REBOOT=no
FAILED=
BEGIN_DISKS
/\t40G\t10G\t30G\t25
END_DISKS
BEGIN_PROCS
END_PROCS
`)
  const health = assessHealth(stats)
  assert.equal(health.overall, 'ok')
  assert.equal(health.notes.length, 0)
})

test('parses a light status snapshot without processes', () => {
  const stats = parseHealth(`
HOST=box
OS=Ubuntu 24.04.3 LTS
KERNEL=6.8.0
UPTIME=up 2 hours
MEM=200 1000 700
LOAD=0.10 0.12 0.08
CPU=2
REBOOT=no
BEGIN_DISKS
/\t20G\t4.0G\t15G\t22
END_DISKS
`)
  assert.equal(stats.hostname, 'box')
  assert.equal(stats.cpuCount, 2)
  assert.equal(stats.disks[0]?.percent, 22)
  assert.equal(stats.processes.length, 0)
  assert.equal(assessHealth(stats).overall, 'ok')
})
