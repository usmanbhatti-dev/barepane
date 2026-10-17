// Regenerates every app icon from public/icon.svg.
//
//   npx electron scripts/build-icons.mjs
//
// Outputs: build/icon.png, build/icons/*.png (Linux), build/icon.icns (macOS, needs `iconutil`),
// build/icon.ico (Windows), public/icon.png, public/favicon.ico.
// Rendering goes through Electron so the PNGs keep real transparency.
import { app, BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(path.join(root, 'public/icon.svg'), 'utf8')
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]
const ICO_SIZES = [16, 32, 48, 64, 128, 256]

function pngBuffers(master) {
  const sizes = new Set([...LINUX_SIZES, ...ICO_SIZES, 64, 256, 512, 1024])
  const out = new Map()
  for (const size of sizes) {
    out.set(size, master.resize({ width: size, height: size, quality: 'best' }).toPNG())
  }
  return out
}

// ICO files can embed PNG payloads directly (Vista+).
function buildIco(pngs) {
  const entries = ICO_SIZES.map((size) => ({ size, data: pngs.get(size) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = 6 + entries.length * 16
  const dir = []
  for (const { size, data } of entries) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    dir.push(entry)
    offset += data.length
  }
  return Buffer.concat([header, ...dir, ...entries.map((entry) => entry.data)])
}

function buildIcns(pngs) {
  if (process.platform !== 'darwin') {
    console.warn('Skipping .icns (needs macOS iconutil)')
    return
  }
  const set = path.join(root, 'build/icon.iconset')
  rmSync(set, { recursive: true, force: true })
  mkdirSync(set, { recursive: true })
  const map = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ]
  for (const [name, size] of map) writeFileSync(path.join(set, name), pngs.get(size))
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(root, 'build/icon.icns')])
  rmSync(set, { recursive: true, force: true })
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, sandbox: true },
  })
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden"><img style="display:block;width:1024px;height:1024px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((resolve) => setTimeout(resolve, 400))
  const shot = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const master = shot.resize({ width: 1024, height: 1024, quality: 'best' })
  const pngs = pngBuffers(master)

  mkdirSync(path.join(root, 'build/icons'), { recursive: true })
  for (const size of LINUX_SIZES) writeFileSync(path.join(root, `build/icons/${size}x${size}.png`), pngs.get(size))
  writeFileSync(path.join(root, 'build/icon.png'), pngs.get(1024))
  writeFileSync(path.join(root, 'public/icon.png'), pngs.get(512))
  const ico = buildIco(pngs)
  writeFileSync(path.join(root, 'build/icon.ico'), ico)
  writeFileSync(path.join(root, 'public/favicon.ico'), ico)
  buildIcns(pngs)
  console.log('Icons written.')
  app.quit()
})
