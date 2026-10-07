// Supabase Edge Function: starts a Razorpay subscription checkout for the
// caller's own organization. Only an Administrator may manage billing.
//
// Razorpay Plans fix their amount at creation time, so the platform's
// current price (platform_settings.monthly_price_paise, editable from the
// Platform Admin page) is only turned into a Plan lazily here, and cached —
// a price change creates a fresh Plan on the next checkout without
// retroactively touching anyone already subscribed on the old one.

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

interface CreateSubscriptionRequest {
  billing_cycle: "monthly" | "yearly"
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
    `${supabaseUrl}/rest/v1/user_profiles?id=eq.${callerUser.id}&select=role,is_active,organization_id,email,display_name,phone`,
    { headers: svc },
  )
  const profileRows = await profileRes.json()
  const callerProfile = Array.isArray(profileRows) ? profileRows[0] : null
  if (!callerProfile || callerProfile.role !== "Administrator" || !callerProfile.is_active) {
    return jsonResponse({ success: false, error: "Only an Administrator can manage billing" }, 403)
  }

  let payload: CreateSubscriptionRequest
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
  }
  if (payload.billing_cycle !== "monthly" && payload.billing_cycle !== "yearly") {
    return jsonResponse({ success: false, error: "billing_cycle must be 'monthly' or 'yearly'" }, 400)
  }
  const cycle = payload.billing_cycle

  const orgRes = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${callerProfile.organization_id}&select=id,name,razorpay_customer_id`,
    { headers: svc },
  )
  const orgRows = await orgRes.json()
  const org = Array.isArray(orgRows) ? orgRows[0] : null
  if (!org) {
    return jsonResponse({ success: false, error: "Organization not found" }, 404)
  }

  const settingsRes = await fetch(
    `${supabaseUrl}/rest/v1/platform_settings?id=eq.true&select=*`,
    { headers: svc },
  )
  const settingsRows = await settingsRes.json()
  const settings = Array.isArray(settingsRows) ? settingsRows[0] : null
  if (!settings) {
    return jsonResponse({ success: false, error: "Pricing is not configured" }, 500)
  }

  const amountPaise = cycle === "monthly" ? settings.monthly_price_paise : settings.monthly_price_paise * 10
  const razorpayAuth = "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`)

  const cachedPlanId = cycle === "monthly" ? settings.razorpay_monthly_plan_id : settings.razorpay_yearly_plan_id
  const cachedPlanPrice = cycle === "monthly" ? settings.razorpay_monthly_plan_price_paise : settings.razorpay_yearly_plan_price_paise

  let planId = cachedPlanId
  if (!planId || cachedPlanPrice !== amountPaise) {
    const planRes = await fetch("https://api.razorpay.com/v1/plans", {
      method: "POST",
      headers: { Authorization: razorpayAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        period: cycle === "monthly" ? "monthly" : "yearly",
        interval: 1,
        item: {
          name: cycle === "monthly" ? "Business Management System — Monthly" : "Business Management System — Yearly",
          amount: amountPaise,
          currency: "INR",
        },
      }),
    })
    const planJson = await planRes.json()
    if (!planRes.ok) {
      return jsonResponse({ success: false, error: planJson?.error?.description || "Failed to set up the billing plan" }, 502)
    }
    planId = planJson.id

    const settingsPatch = cycle === "monthly"
      ? { razorpay_monthly_plan_id: planId, razorpay_monthly_plan_price_paise: amountPaise }
      : { razorpay_yearly_plan_id: planId, razorpay_yearly_plan_price_paise: amountPaise }
    await fetch(`${supabaseUrl}/rest/v1/platform_settings?id=eq.true`, {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(settingsPatch),
    })
  }

  let customerId = org.razorpay_customer_id
  if (!customerId) {
    const customerRes = await fetch("https://api.razorpay.com/v1/customers", {
      method: "POST",
      headers: { Authorization: razorpayAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: org.name,
        email: callerProfile.email,
        contact: callerProfile.phone || undefined,
        fail_existing: "0",
      }),
    })
    const customerJson = await customerRes.json()
    if (!customerRes.ok) {
      return jsonResponse({ success: false, error: customerJson?.error?.description || "Failed to set up billing customer" }, 502)
    }
    customerId = customerJson.id
    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${org.id}`, {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ razorpay_customer_id: customerId }),
    })
  }

  // total_count is required by Razorpay's Subscriptions API — there's no
  // "until cancelled" option, so this uses a long horizon (10 years) rather
  // than a real end date; cancellation is a separate, explicit action.
  const subscriptionRes = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: razorpayAuth, "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: planId,
      customer_id: customerId,
      customer_notify: 1,
      total_count: cycle === "monthly" ? 120 : 10,
      notes: { organization_id: org.id },
    }),
  })
  const subscriptionJson = await subscriptionRes.json()
  if (!subscriptionRes.ok) {
    return jsonResponse({ success: false, error: subscriptionJson?.error?.description || "Failed to start the subscription" }, 502)
  }

  await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${org.id}`, {
    method: "PATCH",
    headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ razorpay_subscription_id: subscriptionJson.id }),
  })

  return jsonResponse({
    success: true,
    razorpay_subscription_id: subscriptionJson.id,
    razorpay_key_id: razorpayKeyId,
    amount_paise: amountPaise,
  })
})
