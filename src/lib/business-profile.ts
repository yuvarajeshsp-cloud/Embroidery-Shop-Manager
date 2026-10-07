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
const OWNER_KEY = "business_profile_cache_owner_v1"
const DEFAULT_NAME = "Business Management System"

export interface BusinessProfile {
  companyName: string
  companyLogo: string | null
  sidebarColor: string | null
  buttonColor: string | null
}

const DEFAULT_PROFILE: BusinessProfile = {
  companyName: DEFAULT_NAME,
  companyLogo: null,
  sidebarColor: null,
  buttonColor: null,
}

function readCache(): BusinessProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROFILE
    const parsed = JSON.parse(raw) as Partial<BusinessProfile>
    return {
      companyName: parsed.companyName?.trim() || DEFAULT_NAME,
      companyLogo: parsed.companyLogo || null,
      sidebarColor: parsed.sidebarColor || null,
      buttonColor: parsed.buttonColor || null,
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

/** Which signed-in user the cached profile was fetched for. */
let cacheOwner: string | null = null

function writeCache(profile: BusinessProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    if (cacheOwner) localStorage.setItem(OWNER_KEY, cacheOwner)
  } catch {
    // private browsing / storage full — fine to skip persisting
  }
}

/** Relative luminance of a #rrggbb color, used to pick a readable black/white foreground. */
function readableForeground(hex: string): string {
  const clean = hex.replace("#", "")
  if (clean.length !== 6) return "#ffffff"
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? "#1a1a2e" : "#ffffff"
}

/**
 * Applies the org's custom sidebar/button colors as CSS custom property
 * overrides on the document root, so they take effect the same way in both
 * light and dark mode (an inline style on the root element beats any
 * selector-based rule, including `.dark`). Clears back to the theme's own
 * defaults when a color hasn't been customized.
 */
function mixHex(hex: string, withHex: string, amount: number): string {
  const parse = (h: string) => {
    const c = h.replace("#", "")
    return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16))
  }
  const [r1, g1, b1] = parse(hex)
  const [r2, g2, b2] = parse(withHex)
  const channel = (a: number, b: number) =>
    Math.round(a + (b - a) * amount).toString(16).padStart(2, "0")
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`
}

const SIDEBAR_VARS = [
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
]
const BUTTON_VARS = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
]

function applyBrandColors(profile: BusinessProfile) {
  const root = document.documentElement.style
  if (profile.sidebarColor && /^#[0-9a-f]{6}$/i.test(profile.sidebarColor)) {
    const fg = readableForeground(profile.sidebarColor)
    root.setProperty("--sidebar", profile.sidebarColor)
    root.setProperty("--sidebar-foreground", fg)
    // Hover/selected rows and dividers are shades of the chosen colour.
    root.setProperty("--sidebar-accent", mixHex(profile.sidebarColor, fg, 0.12))
    root.setProperty("--sidebar-accent-foreground", fg)
    root.setProperty("--sidebar-border", mixHex(profile.sidebarColor, fg, 0.18))
  } else {
    SIDEBAR_VARS.forEach((v) => root.removeProperty(v))
  }
  if (profile.buttonColor && /^#[0-9a-f]{6}$/i.test(profile.buttonColor)) {
    const fg = readableForeground(profile.buttonColor)
    root.setProperty("--primary", profile.buttonColor)
    root.setProperty("--primary-foreground", fg)
    root.setProperty("--ring", profile.buttonColor)
    // The active menu item and the mobile bottom bar follow the button colour.
    root.setProperty("--sidebar-primary", profile.buttonColor)
    root.setProperty("--sidebar-primary-foreground", fg)
    root.setProperty("--sidebar-ring", profile.buttonColor)
  } else {
    BUTTON_VARS.forEach((v) => root.removeProperty(v))
  }
}

let current: BusinessProfile = readCache()
applyBrandColors(current)
const listeners = new Set<(profile: BusinessProfile) => void>()
let inFlight: Promise<void> | null = null

function notify() {
  applyBrandColors(current)
  for (const listener of listeners) listener(current)
}

export function refreshBusinessProfile(): Promise<void> {
  // Nothing to fetch until a signed-in user has claimed the profile (see
  // claimBusinessProfile) — a fetch made before the stored session is restored
  // would come back empty and wipe the logo that is already showing.
  if (!cacheOwner) return Promise.resolve()
  if (inFlight) return inFlight
  inFlight = fetchBusinessSettings()
    .then((settings) => {
      current = {
        companyName: (settings.company_name || DEFAULT_NAME).trim() || DEFAULT_NAME,
        companyLogo: settings.company_logo_data_url || null,
        sidebarColor: settings.sidebar_color || null,
        buttonColor: settings.button_color || null,
      }
      writeCache(current)
      notify()
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/**
 * Called whenever the signed-in user is known or changes. The cached name and
 * logo belong to one specific user: reopening the app as the same user keeps
 * showing their shop's logo straight away (no flash of a placeholder) while it
 * refreshes in the background; any other user, or nobody, starts clean so one
 * shop's branding never shows for another account.
 */
export function claimBusinessProfile(userId: string | null) {
  if (!userId) {
    resetBusinessProfile()
    return
  }
  let storedOwner: string | null = null
  try {
    storedOwner = localStorage.getItem(OWNER_KEY)
  } catch {
    // ignore
  }
  if (storedOwner !== userId) {
    resetBusinessProfile()
  }
  cacheOwner = userId
  try {
    localStorage.setItem(OWNER_KEY, userId)
  } catch {
    // ignore
  }
  applyBrandColors(current)
  void refreshBusinessProfile()
}

export function getCachedBusinessProfile(): BusinessProfile {
  return current
}

/**
 * Drops the cached name/logo (in memory and in localStorage) and notifies
 * every mounted consumer immediately. Call this whenever the signed-in user
 * changes — otherwise whichever organization's settings got fetched first
 * in this tab's lifetime keeps showing for every account signed into afterward.
 */
export function resetBusinessProfile() {
  current = DEFAULT_PROFILE
  inFlight = null
  cacheOwner = null
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // ignore
  }
  notify()
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
