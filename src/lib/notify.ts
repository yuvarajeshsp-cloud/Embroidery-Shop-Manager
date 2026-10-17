import * as React from "react"
import { toast } from "sonner"

// One place for "this was saved" messages. They show as a slim strip across the
// top of the app (see NoticeBanner) instead of a pop-up, and never move the page.

export interface Notice {
  id: number
  text: string
}

let current: Notice | null = null
let nextId = 1
let mounted = 0
let clearTimer: ReturnType<typeof setTimeout> | null = null
let autoTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Shows `text` in the banner. Without a banner on screen (sign-in pages) it falls back to a pop-up. */
function success(text: string) {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
  if (mounted === 0) {
    toast.success(text)
    return
  }
  current = { id: nextId++, text }
  emit()
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    current = null
    emit()
  }, 3800)
}

export const notify = { success }

export function useNotice(): Notice | null {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

/** The banner reports that it is on screen, so messages know where to go. */
export function useNoticeHost() {
  React.useEffect(() => {
    mounted++
    return () => {
      mounted--
    }
  }, [])
}

// ---- automatic messages for saves that have no wording of their own ----------

const NOUN: Record<string, string> = {
  orders: "Order",
  order_items: "Item",
  order_additional_costs: "Extra cost",
  customers: "Customer",
  payments: "Payment",
  expenses: "Expense",
  config_items: "Setting",
  business_settings: "Business setting",
  order_item_attachments: "File",
  user_profiles: "User",
  whatsapp_templates: "Template",
}
const VERB = { POST: "added", PATCH: "updated", DELETE: "deleted" } as const

/**
 * Called after every successful insert/update/delete. A page that says
 * something specific ("Payment recorded") speaks within a moment and wins; if
 * nobody does, a plain "Order updated" is shown so no save goes unnoticed.
 */
export function noteSave(table: string, method: "POST" | "PATCH" | "DELETE", opts: { queued?: boolean; upsert?: boolean } = {}) {
  const noun = NOUN[table]
  if (!noun || autoTimer) return // unknown/internal table, or a message is already waiting
  const verb = opts.upsert ? "saved" : VERB[method]
  autoTimer = setTimeout(() => {
    autoTimer = null
    success(`${noun} ${verb}${opts.queued ? " — will sync when you're back online" : ""}`)
  }, 700)
}
