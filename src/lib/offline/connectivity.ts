import * as React from "react"
import { Capacitor } from "@capacitor/core"
import { Network } from "@capacitor/network"

// Whether the app can reach the server right now. Three sources feed it:
//   - the device's own network status (Wi-Fi/mobile on or off),
//   - requests that fail with a network error (Wi-Fi with no internet, a
//     captive portal, a dead mobile signal), and
//   - a light probe that runs while offline to notice when the server is back.

let online = typeof navigator === "undefined" ? true : navigator.onLine
let deviceOnline = online
let probeTimer: ReturnType<typeof setTimeout> | null = null
let probeUrl: { url: string; key: string } | null = null
const listeners = new Set<() => void>()
const changeListeners = new Set<(online: boolean) => void>()

function emit() {
  for (const l of listeners) l()
}

function set(next: boolean) {
  if (next === online) return
  online = next
  emit()
  for (const l of changeListeners) l(next)
  if (!next) scheduleProbe()
}

export function isOnline(): boolean {
  return online
}

/** Called for every transition (not at start-up), e.g. to sync when the connection returns. */
export function onConnectivityChange(listener: (online: boolean) => void): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

/** The app's data requests report network failures here. */
export function reportNetworkFailure() {
  set(false)
}

/** Lets the probe know which server to ask. */
export function configureProbe(supabaseUrl: string, anonKey: string) {
  probeUrl = { url: `${supabaseUrl}/auth/v1/health`, key: anonKey }
}

async function reachable(): Promise<boolean> {
  if (!probeUrl) return true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    // Any answer at all (even an error status) means the server was reached.
    await fetch(probeUrl.url, { headers: { apikey: probeUrl.key }, signal: controller.signal, cache: "no-store" })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function scheduleProbe(delay = 4000) {
  if (probeTimer) return
  probeTimer = setTimeout(async () => {
    probeTimer = null
    if (online) return
    if (deviceOnline && (await reachable())) set(true)
    else scheduleProbe(6000)
  }, delay)
}

function deviceChanged(next: boolean) {
  deviceOnline = next
  if (!next) set(false)
  else if (!online) {
    // The radio is back; confirm the server really is reachable before saying so.
    void reachable().then((ok) => ok ? set(true) : scheduleProbe())
  }
}

let started = false
export function startConnectivityMonitor() {
  if (started) return
  started = true
  window.addEventListener("online", () => deviceChanged(true))
  window.addEventListener("offline", () => deviceChanged(false))
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !online && deviceOnline) scheduleProbe(500)
  })
  if (Capacitor.isNativePlatform()) {
    void Network.getStatus().then((s) => {
      deviceOnline = s.connected
      if (!s.connected) set(false)
    })
    void Network.addListener("networkStatusChange", (s) => deviceChanged(s.connected))
  }
  if (!online) scheduleProbe()
}

export function useOnline(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => online,
  )
}
