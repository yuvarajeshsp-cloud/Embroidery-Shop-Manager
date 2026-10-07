import * as React from "react"

import { supabase } from "./supabase"
import { edgeFunctionErrorMessage } from "./edge-function-error"
import type { Organization, OrganizationAccessLevel, PlatformSettings } from "./types"

/**
 * The org's current access level, straight from the same
 * organization_access_level() function RLS itself enforces — so this is a
 * true reflection of what the database will actually allow, not a
 * client-side guess that can drift out of sync with it.
 */
export function useOrganizationAccess(organizationId: string | null) {
  const [accessLevel, setAccessLevel] = React.useState<OrganizationAccessLevel | null>(null)
  const [organization, setOrganization] = React.useState<Organization | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    if (!organizationId) {
      setAccessLevel(null)
      setOrganization(null)
      setLoading(false)
      return
    }
    const [{ data: level }, { data: org }] = await Promise.all([
      supabase.rpc("organization_access_level"),
      supabase.from("organizations").select("*").eq("id", organizationId).maybeSingle(),
    ])
    setAccessLevel((level as OrganizationAccessLevel) ?? null)
    setOrganization((org as Organization) ?? null)
    setLoading(false)
  }, [organizationId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return { accessLevel, organization, loading, refresh }
}

export async function fetchPlatformSettings(): Promise<PlatformSettings | null> {
  const { data } = await supabase.from("platform_settings").select("*").eq("id", true).maybeSingle()
  return (data as PlatformSettings) ?? null
}

export interface RazorpaySubscriptionResult {
  razorpay_subscription_id: string
  razorpay_key_id: string
  amount_paise: number
}

export async function createRazorpaySubscription(billingCycle: "monthly" | "yearly"): Promise<RazorpaySubscriptionResult> {
  const { data, error } = await supabase.functions.invoke("razorpay-create-subscription", {
    body: { billing_cycle: billingCycle },
  })
  if (error) throw new Error(await edgeFunctionErrorMessage(error, "Failed to start checkout"))
  if (!data?.success) throw new Error(data?.error || "Failed to start checkout")
  return data as RazorpaySubscriptionResult
}

export async function verifyRazorpayPayment(params: {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke("razorpay-verify-payment", { body: params })
  if (error) throw new Error(await edgeFunctionErrorMessage(error, "Failed to confirm payment"))
  if (!data?.success) throw new Error(data?.error || "Failed to confirm payment")
}

let checkoutScriptPromise: Promise<void> | null = null

/** Lazily loads Razorpay's Checkout.js — only needed once someone actually opens the subscribe screen. */
export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (checkoutScriptPromise) return checkoutScriptPromise
  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load the payment form. Check your connection and try again."))
    document.body.appendChild(script)
  })
  return checkoutScriptPromise
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void }
  }
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}
