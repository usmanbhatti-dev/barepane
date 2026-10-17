import { APP_NAME } from '@shared/brand'

export default function DesktopOnly() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="chrome-inset app-drag h-10 shrink-0 bg-chrome" />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <img src="./icon.svg" alt="" className="mb-4 h-12 w-12 rounded-xl" />
        <h1 className="text-lg font-semibold">{APP_NAME} is a desktop app</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-white/60">
          SSH, SFTP, and the terminal run in the Electron process. Open this project with
          <span className="font-mono text-white/80"> npm run dev </span>
          and use the native window — not a browser tab.
        </p>
      </div>
    </div>
  )
}
