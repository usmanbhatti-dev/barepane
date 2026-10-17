import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.join(root, '.barepane-runtime')
const env = { ...process.env }

if (process.platform === 'darwin') {
  const srcApp = path.join(root, 'node_modules/electron/dist/Electron.app')
  const destApp = path.join(dest, 'Electron.app')
  const icns = path.join(root, 'build/icon.icns')
  const helper = path.join(destApp, 'Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper')
  if (!existsSync(srcApp)) {
    console.error('Electron is not installed. Run npm install.')
    process.exit(1)
  }
  if (!existsSync(helper)) {
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    execFileSync('ditto', [srcApp, destApp])
  }
  if (existsSync(icns)) {
    cpSync(icns, path.join(destApp, 'Contents/Resources/electron.icns'))
  }
  const plist = path.join(destApp, 'Contents/Info.plist')
  execFileSync('plutil', ['-replace', 'CFBundleName', '-string', 'Barepane', plist])
  execFileSync('plutil', ['-replace', 'CFBundleDisplayName', '-string', 'Barepane', plist])
  execFileSync('plutil', ['-replace', 'CFBundleIdentifier', '-string', 'com.barepane.desktop', plist])
  env.ELECTRON_OVERRIDE_DIST_PATH = dest
}

const vite = path.join(root, 'node_modules/.bin/vite')
const child = spawn(vite, process.argv.slice(2), { stdio: 'inherit', env, shell: process.platform === 'win32' })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
