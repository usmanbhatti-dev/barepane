import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildComposeCommand,
  buildComposeRestartCommand,
  buildPm2Command,
  parseListenAddress,
  parseRuntime,
  uniqueDashboards,
} from './runtime.ts'

const SAMPLE = `
BEGIN_LISTEN
0.0.0.0:22
127.0.0.1:3306
[::]:443
END_LISTEN
BEGIN_PROCS
node	node	2
python	gunicorn	1
web	nginx	1
END_PROCS
BEGIN_PM2
[{"name":"api","pid":91,"pm2_env":{"status":"online","restart_time":3,"pm_out_log_path":"/home/u/.pm2/logs/api-out.log"}}]
END_PM2
BEGIN_COMPOSE
[{"Name":"shop","Status":"running(2)","ConfigFiles":"/home/u/shop/compose.yaml,/home/u/shop/compose.override.yaml"}]
END_COMPOSE
BEGIN_RESTARTING
shop-web-1
END_RESTARTING
BEGIN_VHOSTS
/etc/nginx/sites-enabled/app	app.example.com	/var/www/app	http://127.0.0.1:3000
/etc/nginx/sites-enabled/static	static.example.com	/var/www/html	
END_VHOSTS
`

test('parses listen addresses and loopback', () => {
  assert.deepEqual(parseListenAddress('0.0.0.0:22'), { address: '0.0.0.0', port: 22, public: true })
  assert.equal(parseListenAddress('127.0.0.1:3306')?.public, false)
  assert.equal(parseListenAddress('[::1]:80')?.public, false)
})

test('parses a runtime snapshot', () => {
  const snap = parseRuntime(SAMPLE)
  assert.equal(snap.ports.length, 3)
  assert.equal(snap.stacks.some((item) => item.kind === 'node' && item.count === 2), true)
  assert.equal(snap.pm2[0]?.name, 'api')
  assert.equal(snap.pm2[0]?.outLog, '/home/u/.pm2/logs/api-out.log')
  assert.equal(snap.compose[0]?.name, 'shop')
  assert.equal(snap.compose[0]?.configFile, '/home/u/shop/compose.yaml')
  assert.deepEqual(snap.restarting, ['shop-web-1'])
  assert.equal(snap.vhosts[0]?.kind, 'proxy')
  assert.equal(snap.vhosts[1]?.kind, 'static')
})

test('quotes pm2 and compose actions', () => {
  assert.equal(buildPm2Command('restart', 'api'), "pm2 restart 'api'")
  assert.throws(() => buildPm2Command('restart', 'api; rm'), /not valid/)
  assert.match(buildComposeRestartCommand('shop'), /docker compose -p 'shop' restart/)
  assert.match(buildComposeCommand('up', 'shop', '/home/u/shop/compose.yaml'), /docker compose -f '\/home\/u\/shop\/compose.yaml' -p 'shop' up -d/)
  assert.match(buildComposeCommand('down', 'shop', '/home/u/shop/compose.yaml'), /docker compose -f '\/home\/u\/shop\/compose.yaml' -p 'shop' down/)
  assert.throws(() => buildComposeCommand('up', 'shop'), /Compose file path/)
  assert.throws(() => buildComposeCommand('restart', 'shop; rm'), /not valid/)
  assert.throws(() => buildComposeCommand('down', 'shop', '/tmp/compose.yaml; rm'), /not valid/)
})

test('hints Grafana and Prometheus from listen ports', () => {
  const hints = uniqueDashboards([
    { address: '0.0.0.0', port: 3000, public: true },
    { address: '127.0.0.1', port: 3000, public: false },
    { address: '127.0.0.1', port: 9090, public: false },
    { address: '127.0.0.1', port: 9100, public: false },
    { address: '0.0.0.0', port: 22, public: true },
  ])
  assert.deepEqual(
    hints.map((item) => item.id),
    ['grafana', 'prometheus', 'node_exporter'],
  )
  assert.equal(hints[0]?.open, true)
  assert.equal(hints[2]?.open, false)
})
