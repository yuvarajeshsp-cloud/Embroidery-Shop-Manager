// Supabase Edge Function: checks a sign-up phone verification code against
// the most recent one sent to the caller, and — on match — flips
// user_profiles.phone_verified so the app's verification gate lets them
// through. Runs server-side only so the comparison can't be tampered with
// or brute-forced from the client (attempts are capped per code).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MAX_ATTEMPTS = 5

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

interface OtpRow {
  id: string
  phone: string
  code_hash: string
  attempts: number
  expires_at: string
  verified_at: string | null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Supabase environment not available" }, 500)
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

  let payload: { code?: string }
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
  }

  const code = (payload.code || "").trim()
  if (!code) {
    return jsonResponse({ success: false, error: "Enter the code" }, 400)
  }

  const rowRes = await fetch(
    `${supabaseUrl}/rest/v1/signup_otp_codes?user_id=eq.${callerUser.id}&verified_at=is.null&select=*&order=created_at.desc&limit=1`,
    { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
  )
  const rows: OtpRow[] = await rowRes.json()
  const row = rows[0]
  if (!row) {
    return jsonResponse({ success: false, error: "No code on file — request a new one" }, 404)
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return jsonResponse({ success: false, error: "Code expired — request a new one" }, 410)
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return jsonResponse({ success: false, error: "Too many incorrect attempts — request a new code" }, 429)
  }

  const codeHash = await hashCode(code)
  if (codeHash !== row.code_hash) {
    await fetch(`${supabaseUrl}/rest/v1/signup_otp_codes?id=eq.${row.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ attempts: row.attempts + 1 }),
    })
    const left = MAX_ATTEMPTS - row.attempts - 1
    return jsonResponse({ success: false, error: `Incorrect code — ${left} attempt${left === 1 ? "" : "s"} left` }, 400)
  }

  const [markVerifiedRes, profileUpdateRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/signup_otp_codes?id=eq.${row.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ verified_at: new Date().toISOString() }),
    }),
    fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${callerUser.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ phone: row.phone, phone_verified: true, updated_at: new Date().toISOString() }),
    }),
  ])

  if (!markVerifiedRes.ok || !profileUpdateRes.ok) {
    return jsonResponse({ success: false, error: "Verified, but failed to update your profile — please retry" }, 500)
  }

  return jsonResponse({ success: true })
})
