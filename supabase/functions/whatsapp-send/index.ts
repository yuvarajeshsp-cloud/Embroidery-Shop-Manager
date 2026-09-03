// Supabase Edge Function: sends a WhatsApp Cloud API message and logs the
// outcome. The WhatsApp access token lives only here (WHATSAPP_ACCESS_TOKEN
// secret) — it is never exposed to the browser bundle.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface LogInfo {
  customer_id?: string
  order_id?: string
  message_kind: "status_update" | "invoice" | "design_confirmation" | "customer_material" | "test"
  sent_by?: string
}

interface TemplateRequest {
  kind: "template"
  to: string
  phone_number_id: string
  template_name: string
  language: string
  parameters?: string[]
  log: LogInfo
}

interface MediaRequest {
  kind: "media"
  to: string
  phone_number_id: string
  media_type: "document" | "image"
  link: string
  filename?: string
  caption?: string
  log: LogInfo
}

interface TemplateMediaRequest {
  kind: "template_media"
  to: string
  phone_number_id: string
  template_name: string
  language: string
  media_type: "document" | "image"
  link: string
  filename?: string
  log: LogInfo
}

type SendRequest = TemplateRequest | MediaRequest | TemplateMediaRequest

function sanitizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").replace(/^\+/, "")
}

async function logMessage(
  supabaseUrl: string,
  anonKey: string,
  recipientPhone: string,
  templateName: string | null,
  log: LogInfo,
  status: "sent" | "failed",
  whatsappMessageId: string | null,
  errorMessage: string | null,
) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/whatsapp_message_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        customer_id: log.customer_id || null,
        order_id: log.order_id || null,
        message_kind: log.message_kind,
        template_name: templateName,
        recipient_phone: recipientPhone,
        status,
        whatsapp_message_id: whatsappMessageId,
        error_message: errorMessage,
        sent_by: log.sent_by || null,
      }),
    })
  } catch (err) {
    console.error("Failed to write whatsapp_message_log:", err)
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v20.0"

  if (!accessToken) {
    return new Response(JSON.stringify({ success: false, error: "WHATSAPP_ACCESS_TOKEN is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ success: false, error: "Supabase environment not available" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let payload: SendRequest
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (!payload.to || !payload.phone_number_id) {
    return new Response(JSON.stringify({ success: false, error: "Missing 'to' or 'phone_number_id'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const to = sanitizePhone(payload.to)
  let body: Record<string, unknown>
  let templateNameForLog: string | null = null

  if (payload.kind === "template") {
    templateNameForLog = payload.template_name
    body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: payload.template_name,
        language: { code: payload.language || "en" },
        components: payload.parameters?.length
          ? [
              {
                type: "body",
                parameters: payload.parameters.map((text) => ({ type: "text", text })),
              },
            ]
          : undefined,
      },
    }
  } else if (payload.kind === "media") {
    body = {
      messaging_product: "whatsapp",
      to,
      type: payload.media_type,
      [payload.media_type]: {
        link: payload.link,
        ...(payload.media_type === "document" && payload.filename ? { filename: payload.filename } : {}),
        ...(payload.caption ? { caption: payload.caption } : {}),
      },
    }
  } else if (payload.kind === "template_media") {
    templateNameForLog = payload.template_name
    body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: payload.template_name,
        language: { code: payload.language || "en" },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: payload.media_type,
                [payload.media_type]: {
                  link: payload.link,
                  ...(payload.media_type === "document" && payload.filename ? { filename: payload.filename } : {}),
                },
              },
            ],
          },
        ],
      },
    }
  } else {
    return new Response(JSON.stringify({ success: false, error: "Unknown request kind" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const metaRes = await fetch(`https://graph.facebook.com/${apiVersion}/${payload.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const metaJson = await metaRes.json()

    if (!metaRes.ok) {
      const errorMessage = metaJson?.error?.message || `WhatsApp API returned ${metaRes.status}`
      await logMessage(supabaseUrl, anonKey, to, templateNameForLog, payload.log, "failed", null, errorMessage)
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const whatsappMessageId = metaJson?.messages?.[0]?.id || null
    await logMessage(supabaseUrl, anonKey, to, templateNameForLog, payload.log, "sent", whatsappMessageId, null)

    return new Response(JSON.stringify({ success: true, whatsapp_message_id: whatsappMessageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error calling WhatsApp API"
    await logMessage(supabaseUrl, anonKey, to, templateNameForLog, payload.log, "failed", null, errorMessage)
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
