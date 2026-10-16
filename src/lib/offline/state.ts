import * as React from "react"

export interface SyncState {
  /** Changes made here that are waiting to reach the server. */
  pending: number
  /** Changes the server refused; they need a decision. */
  failed: number
  syncing: boolean
  /** Goes up every time a batch of waiting changes finished sending. */
  syncVersion: number
  /** How many changes the latest batch sent. */
  lastBatch: number
}

let state: SyncState = { pending: 0, failed: 0, syncing: false, syncVersion: 0, lastBatch: 0 }
const listeners = new Set<() => void>()

export function getSyncState(): SyncState {
  return state
}

export function patchSyncState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function useSyncState(): SyncState {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSyncState,
  )
}
