import { supabase } from "./supabase"
import type { ConfigItem } from "./types"
import { APP_NAME } from "./app-info"

const cache = new Map<string, ConfigItem[]>()

export const PRODUCTION_BOARD_STAGE_CATEGORY = "production_board_stage"

export const BUSINESS_PROFILE_FIELDS = [
  "company_name",
  "company_tagline",
  "company_email",
  "company_phone",
  "company_website",
  "company_gst_number",
  "company_address",
  "company_city",
  "company_state",
  "company_pincode",
  "company_logo_data_url",
  "sidebar_color",
  "button_color",
] as const

export type BusinessProfileField = (typeof BUSINESS_PROFILE_FIELDS)[number]

export function setDocumentTitleFromSettings(settings: Record<string, string>) {
  const companyName = (settings.company_name || APP_NAME).trim()
  document.title = companyName
}

export async function fetchConfigItems(category: string): Promise<ConfigItem[]> {
  const cacheKey = category
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  const { data, error } = await supabase
    .from("config_items")
    .select("*")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order")

  if (error) {
    console.error(`Failed to fetch config items for ${category}:`, error)
    return []
  }

  cache.set(cacheKey, data || [])
  return data || []
}

let businessSettingsCache: Record<string, string> | null = null

export function clearConfigCache() {
  cache.clear()
  businessSettingsCache = null
}

export async function fetchBusinessSettings(): Promise<Record<string, string>> {
  if (businessSettingsCache) return businessSettingsCache

  const { data, error } = await supabase.from("business_settings").select("*")
  if (error) {
    console.error("Failed to fetch business settings:", error)
    return {}
  }
  const result: Record<string, string> = {}
  for (const row of data || []) {
    result[row.key] = row.value
  }
  businessSettingsCache = result
  return result
}

export async function saveBusinessSettings(values: Record<string, string>) {
  const entries = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }))

  if (entries.length === 0) return

  const { error } = await supabase.from("business_settings").upsert(entries, { onConflict: "organization_id,key" })

  if (error) {
    throw error
  }
}

export async function getDefaultStitchRate(): Promise<number> {
  const settings = await fetchBusinessSettings()
  return parseFloat(settings["default_rate_per_1000_stitches"] || "10.00")
}
