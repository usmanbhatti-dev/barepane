import { useEffect, useState } from 'react'
import { INITIAL_UPDATE_STATE, type UpdateState } from '@shared/updates'
import { desktop, isDesktop } from './desktop'

/** Live update state from the main process. */
export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>(INITIAL_UPDATE_STATE)
  useEffect(() => {
    if (!isDesktop()) return
    let alive = true
    void desktop()
      .getUpdateState()
      .then((next) => {
        if (alive) setState(next)
      })
      .catch(() => {})
    const off = desktop().onUpdateState((next) => setState(next))
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}
