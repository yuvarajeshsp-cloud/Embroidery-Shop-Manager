import * as React from "react"
import { fetchBusinessSettings } from "./config"

/**
 * Company name/logo, shared across the sidebar, page header, document title
 * and tab icon. Backed by a module-level singleton (so every consumer shares
 * one in-flight fetch instead of each re-querying business_settings) and a
 * localStorage snapshot (so a page load or reload paints the real name/logo
 * immediately instead of flashing the default placeholder while the network
 * request is in flight).
 */

const STORAGE_KEY = "business_profile_cache_v1"
const DEFAULT_NAME = "Embroidery Shop Manager"

export interface BusinessProfile {
  companyName: string
  companyLogo: string | null
}

const DEFAULT_PROFILE: BusinessProfile = { companyName: DEFAULT_NAME, companyLogo: null }

function readCache(): BusinessProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROFILE
    const parsed = JSON.parse(raw) as Partial<BusinessProfile>
    return {
      companyName: parsed.companyName?.trim() || DEFAULT_NAME,
      companyLogo: parsed.companyLogo || null,
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

function writeCache(profile: BusinessProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // private browsing / storage full — fine to skip persisting
  }
}

let current: BusinessProfile = readCache()
const listeners = new Set<(profile: BusinessProfile) => void>()
let inFlight: Promise<void> | null = null

function notify() {
  for (const listener of listeners) listener(current)
}

export function refreshBusinessProfile(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = fetchBusinessSettings()
    .then((settings) => {
      current = {
        companyName: (settings.company_name || DEFAULT_NAME).trim() || DEFAULT_NAME,
        companyLogo: settings.company_logo_data_url || null,
      }
      writeCache(current)
      notify()
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function getCachedBusinessProfile(): BusinessProfile {
  return current
}

export function useBusinessProfile(): BusinessProfile {
  const [profile, setProfile] = React.useState(current)

  React.useEffect(() => {
    listeners.add(setProfile)
    void refreshBusinessProfile()
    return () => {
      listeners.delete(setProfile)
    }
  }, [])

  return profile
}
