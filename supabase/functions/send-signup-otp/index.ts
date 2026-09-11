// Supabase Edge Function: sends a 6-digit phone verification code over
// WhatsApp for the sign-up verification gate. Runs server-side only — the
// WhatsApp access token and the signup phone number/template must never
// reach the browser bundle.
//
// Unlike whatsapp-send (which routes through each *organization's own*
// configured WhatsApp number, set up after they sign up), this always uses
// the platform's own WhatsApp Business number, since a brand-new org has no
// WhatsApp configuration of its own yet at sign-up time.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const CODE_TTL_MINUTES = 10
const RESEND_COOLDOWN_SECONDS = 60
const MAX_SENDS_PER_HOUR = 5

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function sanitizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").replace(/^\+/, "")
}

async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function generateCode(): string {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return String(100000 + (bytes[0] % 900000))
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")
  const signupPhoneNumberId = Deno.env.get("SIGNUP_WHATSAPP_PHONE_NUMBER_ID")
  const signupTemplateName = Deno.env.get("SIGNUP_OTP_TEMPLATE_NAME")
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v20.0"

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !accessToken) {
    return jsonResponse({ success: false, error: "Supabase environment not available" }, 500)
  }
  if (!signupPhoneNumberId || !signupTemplateName) {
    return jsonResponse(
      { success: false, error: "Sign-up phone verification isn't configured yet (missing WhatsApp sender/template)" },
      500,
    )
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

  let payload: { phone?: string }
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
  }

  const phone = sanitizePhone(payload.phone || "")
  if (phone.length < 8) {
    return jsonResponse({ success: false, error: "Enter a valid phone number with country code" }, 400)
  }

  // Rate limit: recent codes for this user, newest first.
  const recentRes = await fetch(
    `${supabaseUrl}/rest/v1/signup_otp_codes?user_id=eq.${callerUser.id}&select=created_at&order=created_at.desc&limit=${MAX_SENDS_PER_HOUR}`,
    { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
  )
  const recent: { created_at: string }[] = await recentRes.json()
  const now = Date.now()
  if (recent[0] && now - new Date(recent[0].created_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    return jsonResponse({ success: false, error: "Please wait a minute before requesting another code" }, 429)
  }
  if (recent.length >= MAX_SENDS_PER_HOUR && now - new Date(recent[recent.length - 1].created_at).getTime() < 3600_000) {
    return jsonResponse({ success: false, error: "Too many codes requested — try again in an hour" }, 429)
  }

  const code = generateCode()
  const codeHash = await hashCode(code)
  const expiresAt = new Date(now + CODE_TTL_MINUTES * 60_000).toISOString()

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/signup_otp_codes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: callerUser.id, phone, code_hash: codeHash, expires_at: expiresAt }),
  })
  if (!insertRes.ok) {
    const errText = await insertRes.text()
    return jsonResponse({ success: false, error: `Failed to generate code: ${errText}` }, 500)
  }

  const waRes = await fetch(`https://graph.facebook.com/${apiVersion}/${signupPhoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: signupTemplateName,
        language: { code: "en" },
        // Every WhatsApp Authentication-category template requires this
        // body {{1}} parameter. If the approved template also has a
        // copy-code button, WhatsApp needs a matching button component too
        // — add one here (see the note on this feature) once that's known.
        components: [{ type: "body", parameters: [{ type: "text", text: code }] }],
      },
    }),
  })
  const waJson = await waRes.json()
  if (!waRes.ok) {
    const message = waJson?.error?.message || `WhatsApp API returned ${waRes.status}`
    return jsonResponse({ success: false, error: message }, 502)
  }

  return jsonResponse({ success: true })
})
