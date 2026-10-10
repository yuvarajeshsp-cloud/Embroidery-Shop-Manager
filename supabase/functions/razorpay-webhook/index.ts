// Supabase Edge Function: Razorpay webhook. This is the durable source of
// truth for subscription lifecycle changes — renewals, failed charges,
// pauses, and cancellations — as opposed to razorpay-verify-payment, which
// only handles the initial checkout's immediate confirmation.
//
// Configure this URL in the Razorpay Dashboard (Settings > Webhooks) for at
// least: subscription.activated, subscription.charged, subscription.halted,
// subscription.cancelled. The webhook secret set there must match
// RAZORPAY_WEBHOOK_SECRET here — it's a separate secret from the API key
// pair, used only to verify these callbacks are genuinely from Razorpay.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// Compares without bailing at the first differing character.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

const STATUS_BY_EVENT: Record<string, string> = {
  "subscription.activated": "active",
  "subscription.charged": "active",
  "subscription.halted": "past_due",
  "subscription.pending": "past_due",
  "subscription.cancelled": "canceled",
  "subscription.completed": "canceled",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    return jsonResponse({ success: false, error: "Server is not configured for billing webhooks yet" }, 500)
  }

  const rawBody = await req.text()
  const signature = req.headers.get("X-Razorpay-Signature") || ""
  const expectedSignature = await hmacSha256Hex(webhookSecret, rawBody)
  if (!signature || !timingSafeEqual(expectedSignature, signature)) {
    return jsonResponse({ success: false, error: "Invalid webhook signature" }, 400)
  }

  let event: { event?: string; payload?: { subscription?: { entity?: Record<string, unknown> } } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
  }

  const eventName = event.event || ""
  const newStatus = STATUS_BY_EVENT[eventName]
  const subscriptionEntity = event.payload?.subscription?.entity
  if (!newStatus || !subscriptionEntity?.id) {
    // Not an event we act on (e.g. payment.* events) — acknowledge so
    // Razorpay doesn't retry it.
    return jsonResponse({ success: true, ignored: true })
  }

  const svc = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey }
  const patch: Record<string, unknown> = { subscription_status: newStatus }
  if (typeof subscriptionEntity.current_end === "number") {
    patch.subscription_current_period_end = new Date(subscriptionEntity.current_end * 1000).toISOString()
  }

  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/organizations?razorpay_subscription_id=eq.${subscriptionEntity.id}`,
    {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  )
  if (!updateRes.ok) {
    const errText = await updateRes.text()
    return jsonResponse({ success: false, error: `Failed to update organization: ${errText}` }, 500)
  }

  return jsonResponse({ success: true })
})
