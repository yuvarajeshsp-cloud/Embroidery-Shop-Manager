// Supabase Edge Function: confirms a just-completed Razorpay subscription
// checkout and activates the organization immediately, so the user isn't
// stuck waiting on the webhook to land. The webhook (razorpay-webhook)
// remains the durable source of truth for renewals, failures and
// cancellations — this is purely a fast-path for the initial payment.
//
// The signature check is what makes this trustworthy: Razorpay's checkout
// returns these three values to the browser, and only someone holding the
// key secret (this function, server-side) can compute a matching signature,
// so a forged "success" callback from the client can't activate billing.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
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

interface VerifyRequest {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID")
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET")
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !razorpayKeyId || !razorpayKeySecret) {
    return jsonResponse({ success: false, error: "Server is not configured for billing yet" }, 500)
  }

  const authHeader = req.headers.get("Authorization") || ""
  const callerToken = authHeader.replace(/^Bearer\s+/i, "")
  if (!callerToken) {
    return jsonResponse({ success: false, error: "Missing Authorization header" }, 401)
  }
  const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${callerToken}`, apikey: anonKey },
  })
  if (!callerRes.ok) {
    return jsonResponse({ success: false, error: "Invalid or expired session" }, 401)
  }
  const callerUser = await callerRes.json()

  const svc = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey }

  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/user_profiles?id=eq.${callerUser.id}&select=organization_id`,
    { headers: svc },
  )
  const profileRows = await profileRes.json()
  const callerProfile = Array.isArray(profileRows) ? profileRows[0] : null
  if (!callerProfile) {
    return jsonResponse({ success: false, error: "Profile not found" }, 404)
  }

  let payload: VerifyRequest
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
  }
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = payload
  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return jsonResponse({ success: false, error: "Missing payment confirmation fields" }, 400)
  }

  // Only the org that started this checkout may confirm it.
  const orgRes = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${callerProfile.organization_id}&razorpay_subscription_id=eq.${razorpay_subscription_id}&select=id`,
    { headers: svc },
  )
  const orgRows = await orgRes.json()
  const org = Array.isArray(orgRows) ? orgRows[0] : null
  if (!org) {
    return jsonResponse({ success: false, error: "Subscription does not belong to your organization" }, 403)
  }

  const expectedSignature = await hmacSha256Hex(razorpayKeySecret, `${razorpay_payment_id}|${razorpay_subscription_id}`)
  if (expectedSignature !== razorpay_signature) {
    return jsonResponse({ success: false, error: "Payment signature could not be verified" }, 400)
  }

  const razorpayAuth = "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`)
  const subRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpay_subscription_id}`, {
    headers: { Authorization: razorpayAuth },
  })
  const subJson = await subRes.json()
  if (!subRes.ok) {
    return jsonResponse({ success: false, error: "Could not confirm subscription status with Razorpay" }, 502)
  }

  const periodEnd = subJson.current_end ? new Date(subJson.current_end * 1000).toISOString() : null

  const settingsRes = await fetch(
    `${supabaseUrl}/rest/v1/platform_settings?id=eq.true&select=razorpay_monthly_plan_id,razorpay_yearly_plan_id`,
    { headers: svc },
  )
  const settingsRows = await settingsRes.json()
  const settings = Array.isArray(settingsRows) ? settingsRows[0] : null
  const plan = settings?.razorpay_yearly_plan_id === subJson.plan_id ? "yearly" : "monthly"

  await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${org.id}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      subscription_status: "active",
      subscription_current_period_end: periodEnd,
      plan,
    }),
  })

  return jsonResponse({ success: true })
})
