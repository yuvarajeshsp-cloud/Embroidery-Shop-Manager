import { supabase } from "./supabase"
import type { ConfigItem } from "./types"

const cache = new Map<string, ConfigItem[]>()

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

export function clearConfigCache() {
  cache.clear()
}

export async function fetchBusinessSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("business_settings").select("*")
  if (error) {
    console.error("Failed to fetch business settings:", error)
    return {}
  }
  const result: Record<string, string> = {}
  for (const row of data || []) {
    result[row.key] = row.value
  }
  return result
}

export async function getDefaultStitchRate(): Promise<number> {
  const settings = await fetchBusinessSettings()
  return parseFloat(settings["default_rate_per_1000_stitches"] || "10.00")
}
