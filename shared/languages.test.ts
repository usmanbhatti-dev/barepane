import assert from 'node:assert/strict'
import test from 'node:test'
import { detectLanguage, languageLabel } from './languages.ts'

test('detects nginx site files without a real extension', () => {
  assert.equal(detectLanguage('/etc/nginx/sites-available/staging.mycounsel.pk'), 'nginx')
  assert.equal(detectLanguage('/etc/nginx/nginx.conf'), 'nginx')
  assert.equal(detectLanguage('/etc/nginx/conf.d/app.conf'), 'nginx')
})

test('detects yaml, env, shell, docker, and systemd units', () => {
  assert.equal(detectLanguage('/var/www/docker-compose.yml'), 'yaml')
  assert.equal(detectLanguage('/home/ubuntu/.env'), 'properties')
  assert.equal(detectLanguage('/home/ubuntu/.env.production'), 'properties')
  assert.equal(detectLanguage('/usr/local/bin/deploy.sh'), 'shell')
  assert.equal(detectLanguage('/opt/app/Dockerfile'), 'docker')
  assert.equal(detectLanguage('/etc/systemd/system/app.service'), 'properties')
  assert.equal(detectLanguage('/etc/hosts'), 'properties')
})

test('treats generic .conf as INI, nginx paths as Nginx', () => {
  assert.equal(detectLanguage('/etc/sysctl.conf'), 'properties')
  assert.equal(detectLanguage('/etc/nginx/nginx.conf'), 'nginx')
})

test('falls back to plain text and labels languages', () => {
  assert.equal(detectLanguage('/home/ubuntu/notes'), 'text')
  assert.equal(languageLabel('nginx'), 'Nginx')
  assert.equal(detectLanguage('/var/www/app.json'), 'json')
  assert.equal(detectLanguage('/var/www/index.html'), 'html')
})
