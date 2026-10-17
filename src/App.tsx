import { useEffect, useRef, useState } from 'react'
import { formatSshError } from '@shared/errors'
import type { ConnectPayload, ConnectResult } from '@shared/types'
import ConnectionBar from './components/ConnectionBar'
import DesktopOnly from './components/DesktopOnly'
import ErrorBoundary from './components/ErrorBoundary'
import UpdateBanner from './components/UpdateBanner'
import { desktop, isDesktop } from './lib/desktop'
import { dropCache, moveCache } from './lib/remoteCache'
import LoginScreen from './pages/LoginScreen'
import Workspace from './pages/Workspace'

type SlotStatus = 'up' | 'reconnecting' | 'failed'

type WorkspaceSlot = {
  key: string
  session: ConnectResult
  payload: ConnectPayload
  status: SlotStatus
  error: string
}

const BACKOFF_MS = [1000, 2000, 4000, 6000, 8000, 8000, 8000, 8000]

export default function App() {
  const [slots, setSlots] = useState<WorkspaceSlot[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [dropped, setDropped] = useState('')
  const slotsRef = useRef(slots)
  const closing = useRef(new Set<string>())
  const retryGen = useRef(new Map<string, number>())
  slotsRef.current = slots

  useEffect(() => {
    if (!isDesktop()) return
    return desktop().onDisconnected((id, reason) => {
      if (closing.current.has(id)) {
        closing.current.delete(id)
        return
      }
      const slot = slotsRef.current.find((item) => item.session.id === id)
      if (!slot) {
        setDropped(reason || 'Connection closed')
        return
      }
      void reconnectSlot(slot.key, reason || 'Connection closed')
    })
  }, [])

  if (!isDesktop()) {
    return (
      <ErrorBoundary>
        <DesktopOnly />
      </ErrorBoundary>
    )
  }

  function addSession(next: ConnectResult, payload: ConnectPayload) {
    setDropped('')
    setAdding(false)
    setSlots((current) => {
      const match = current.find(
        (item) =>
          item.session.host === next.host &&
          item.session.username === next.username &&
          item.session.port === next.port,
      )
      if (match) {
        setActiveKey(match.key)
        return current.map((item) =>
          item.key === match.key ? { ...item, session: next, payload, status: 'up', error: '' } : item,
        )
      }
      const key = crypto.randomUUID()
      setActiveKey(key)
      return [...current, { key, session: next, payload, status: 'up', error: '' }]
    })
  }

  async function reconnectSlot(key: string, reason: string) {
    const gen = (retryGen.current.get(key) ?? 0) + 1
    retryGen.current.set(key, gen)
    setSlots((current) =>
      current.map((item) => (item.key === key ? { ...item, status: 'reconnecting', error: reason } : item)),
    )
    for (const wait of BACKOFF_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, wait))
      if (retryGen.current.get(key) !== gen) return
      const slot = slotsRef.current.find((item) => item.key === key)
      if (!slot) return
      try {
        const next = await desktop().connect(slot.payload)
        if (retryGen.current.get(key) !== gen) {
          void desktop().disconnect(next.id)
          return
        }
        moveCache(slot.session.id, next.id)
        setSlots((current) =>
          current.map((item) => (item.key === key ? { ...item, session: next, status: 'up', error: '' } : item)),
        )
        return
      } catch (err) {
        setSlots((current) =>
          current.map((item) => (item.key === key ? { ...item, error: formatSshError(err) } : item)),
        )
      }
    }
    setSlots((current) => current.map((item) => (item.key === key ? { ...item, status: 'failed' } : item)))
  }

  function closeSession(key: string, options?: { prompt?: boolean }) {
    const slot = slots.find((item) => item.key === key)
    if (!slot) return
    const label = `${slot.session.username}@${slot.session.host}`
    if (options?.prompt !== false && !window.confirm(`Disconnect from ${label}? Unsaved files on this server will be lost.`)) {
      return
    }
    retryGen.current.set(key, (retryGen.current.get(key) ?? 0) + 1)
    closing.current.add(slot.session.id)
    dropCache(slot.session.id)
    void desktop().disconnect(slot.session.id)
    setAdding(false)
    setSlots((current) => {
      const next = current.filter((item) => item.key !== key)
      setActiveKey((active) => {
        if (active !== key) return active
        return next[0]?.key ?? null
      })
      return next
    })
    if (slots.length <= 1) setDropped('')
  }

  const sessions = slots.map((item) => item.session)
  const activeSlot = slots.find((item) => item.key === (activeKey ?? slots[0]?.key)) ?? null
  const showLogin = slots.length === 0 || adding

  return (
    <ErrorBoundary>
      <div className="relative flex h-full min-h-0 flex-col">
        {slots.length ? (
          <>
            <ConnectionBar
              sessions={sessions}
              activeId={activeSlot?.session.id ?? sessions[0].id}
              onSelect={(id) => {
                const next = slots.find((item) => item.session.id === id)
                if (!next) return
                setAdding(false)
                setActiveKey(next.key)
              }}
              onClose={(id) => {
                const next = slots.find((item) => item.session.id === id)
                if (next) closeSession(next.key)
              }}
              onAdd={() => setAdding(true)}
            />
            {slots.map((slot) => (
              <div
                key={slot.key}
                className={`relative min-h-0 flex-1 flex-col ${slot.key === activeSlot?.key && !adding ? 'flex' : 'hidden'}`}
              >
                {slot.status !== 'up' ? (
                  <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-canvas/80 px-6 text-center">
                    <div className="text-sm font-semibold">
                      {slot.status === 'failed' ? 'Could not reconnect' : 'Reconnecting…'}
                    </div>
                    <div className="max-w-md text-xs leading-5 text-white/60">
                      {slot.session.username}@{slot.session.host}
                      {slot.error ? ` — ${slot.error}` : ''}
                    </div>
                    <div className="flex gap-2">
                      {slot.status === 'failed' ? (
                        <button
                          type="button"
                          className="ui-btn-primary px-3 py-1.5 text-xs"
                          onClick={() => void reconnectSlot(slot.key, slot.error || 'Retry')}
                        >
                          Retry
                        </button>
                      ) : null}
                      <button type="button" className="ui-btn px-3 py-1.5 text-xs" onClick={() => closeSession(slot.key, { prompt: false })}>
                        Give up
                      </button>
                    </div>
                  </div>
                ) : null}
                <Workspace
                  session={slot.session}
                  active={slot.key === activeSlot?.key && !adding}
                  canBroadcast={slots.length > 1}
                  onBroadcast={(command) => {
                    for (const item of slots) desktop().writeAllTerminals(item.session.id, `${command}\n`)
                  }}
                  onDisconnect={() => closeSession(slot.key, { prompt: false })}
                />
              </div>
            ))}
          </>
        ) : null}
        {showLogin ? (
          <LoginScreen
            reconnectMessage={slots.length === 0 ? dropped : ''}
            onConnected={addSession}
            onCancel={adding ? () => setAdding(false) : undefined}
          />
        ) : null}
        <UpdateBanner />
      </div>
    </ErrorBoundary>
  )
}
