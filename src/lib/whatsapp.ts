import { supabase } from "./supabase"
import { fetchBusinessSettings } from "./config"
import type { Customer, Order, WhatsAppMessageKind, WhatsAppTemplate } from "./types"

export interface WhatsAppConfig {
  phoneNumberId: string
  businessAccountId: string
  apiVersion: string
  statusTemplateName: string
  statusTemplateLanguage: string
  documentShareTemplateName: string
  documentShareTemplateLanguage: string
  imageShareTemplateName: string
  imageShareTemplateLanguage: string
}

export const WHATSAPP_CONFIG_KEYS = {
  phoneNumberId: "whatsapp_phone_number_id",
  businessAccountId: "whatsapp_business_account_id",
  apiVersion: "whatsapp_api_version",
  statusTemplateName: "whatsapp_status_template",
  statusTemplateLanguage: "whatsapp_status_template_language",
  documentShareTemplateName: "whatsapp_document_share_template",
  documentShareTemplateLanguage: "whatsapp_document_share_template_language",
  imageShareTemplateName: "whatsapp_image_share_template",
  imageShareTemplateLanguage: "whatsapp_image_share_template_language",
} as const

export async function fetchWhatsAppConfig(): Promise<WhatsAppConfig> {
  const settings = await fetchBusinessSettings()
  return {
    phoneNumberId: settings[WHATSAPP_CONFIG_KEYS.phoneNumberId] || "",
    businessAccountId: settings[WHATSAPP_CONFIG_KEYS.businessAccountId] || "",
    apiVersion: settings[WHATSAPP_CONFIG_KEYS.apiVersion] || "v20.0",
    statusTemplateName: settings[WHATSAPP_CONFIG_KEYS.statusTemplateName] || "",
    statusTemplateLanguage: settings[WHATSAPP_CONFIG_KEYS.statusTemplateLanguage] || "en",
    documentShareTemplateName: settings[WHATSAPP_CONFIG_KEYS.documentShareTemplateName] || "",
    documentShareTemplateLanguage: settings[WHATSAPP_CONFIG_KEYS.documentShareTemplateLanguage] || "en",
    imageShareTemplateName: settings[WHATSAPP_CONFIG_KEYS.imageShareTemplateName] || "",
    imageShareTemplateLanguage: settings[WHATSAPP_CONFIG_KEYS.imageShareTemplateLanguage] || "en",
  }
}

export async function fetchWhatsAppTemplates(activeOnly = false): Promise<WhatsAppTemplate[]> {
  let query = supabase.from("whatsapp_templates").select("*").order("name")
  if (activeOnly) query = query.eq("is_active", true)
  const { data, error } = await query
  if (error) {
    console.error("Failed to fetch WhatsApp templates:", error)
    return []
  }
  return data || []
}

interface SendResult {
  success: boolean
  error?: string
}

async function invokeWhatsAppFunction(body: Record<string, unknown>): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke("whatsapp-send", { body })
  if (error) {
    return { success: false, error: error.message }
  }
  if (!data?.success) {
    return { success: false, error: data?.error || "Failed to send message" }
  }
  return { success: true }
}

export function customerWhatsAppNumber(customer: Customer): string | null {
  return customer.whatsapp || customer.phone || null
}

// WhatsApp Cloud API only accepts these MIME types per media category.
// Anything else (e.g. BMP, GIF, WEBP images) can't be sent in any form.
const WHATSAPP_IMAGE_TYPES = new Set(["image/jpeg", "image/png"])
const WHATSAPP_DOCUMENT_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
])

export function getWhatsAppMediaType(fileType: string | null): "image" | "document" | null {
  if (!fileType) return null
  if (WHATSAPP_IMAGE_TYPES.has(fileType)) return "image"
  if (WHATSAPP_DOCUMENT_TYPES.has(fileType)) return "document"
  return null
}

export async function sendOrderStatusUpdate(
  customer: Customer,
  order: Order,
  newStatus: string,
  sentBy: string | undefined,
): Promise<SendResult> {
  const to = customerWhatsAppNumber(customer)
  if (!to) return { success: false, error: "Customer has no phone/WhatsApp number" }

  const config = await fetchWhatsAppConfig()
  if (!config.phoneNumberId || !config.statusTemplateName) {
    return { success: false, error: "WhatsApp status template is not configured" }
  }

  return invokeWhatsAppFunction({
    kind: "template",
    to,
    phone_number_id: config.phoneNumberId,
    template_name: config.statusTemplateName,
    language: config.statusTemplateLanguage,
    parameters: [customer.customer_business_name, order.order_number, newStatus],
    log: {
      customer_id: customer.id,
      order_id: order.id,
      message_kind: "status_update" satisfies WhatsAppMessageKind,
      sent_by: sentBy,
    },
  })
}

export async function sendWhatsAppMedia(
  customer: Customer,
  order: Order,
  mediaType: "document" | "image",
  link: string,
  filename: string | undefined,
  messageKind: WhatsAppMessageKind,
  sentBy: string | undefined,
): Promise<SendResult> {
  const to = customerWhatsAppNumber(customer)
  if (!to) return { success: false, error: "Customer has no phone/WhatsApp number" }

  const config = await fetchWhatsAppConfig()
  if (!config.phoneNumberId) {
    return { success: false, error: "WhatsApp phone number ID is not configured" }
  }

  return invokeWhatsAppFunction({
    kind: "media",
    to,
    phone_number_id: config.phoneNumberId,
    media_type: mediaType,
    link,
    filename,
    log: {
      customer_id: customer.id,
      order_id: order.id,
      message_kind: messageKind,
      sent_by: sentBy,
    },
  })
}

async function sendWhatsAppTemplateMedia(
  customer: Customer,
  order: Order,
  mediaType: "document" | "image",
  templateName: string,
  language: string,
  link: string,
  filename: string | undefined,
  messageKind: WhatsAppMessageKind,
  sentBy: string | undefined,
): Promise<SendResult> {
  const to = customerWhatsAppNumber(customer)
  if (!to) return { success: false, error: "Customer has no phone/WhatsApp number" }

  const config = await fetchWhatsAppConfig()
  if (!config.phoneNumberId) {
    return { success: false, error: "WhatsApp phone number ID is not configured" }
  }

  return invokeWhatsAppFunction({
    kind: "template_media",
    to,
    phone_number_id: config.phoneNumberId,
    template_name: templateName,
    language,
    media_type: mediaType,
    link,
    filename,
    log: {
      customer_id: customer.id,
      order_id: order.id,
      message_kind: messageKind,
      sent_by: sentBy,
    },
  })
}

/**
 * Sends a file to a customer, preferring a template with a matching media
 * header (works regardless of the 24-hour customer-service window) and
 * falling back to a plain document/image message if no such template is
 * configured, or if the template send itself fails (e.g. it doesn't exist
 * on Meta's side, or its header type doesn't match).
 */
export async function sendWhatsAppFile(
  customer: Customer,
  order: Order,
  mediaType: "document" | "image",
  link: string,
  filename: string | undefined,
  messageKind: WhatsAppMessageKind,
  sentBy: string | undefined,
): Promise<SendResult> {
  const config = await fetchWhatsAppConfig()
  const templateName = mediaType === "document" ? config.documentShareTemplateName : config.imageShareTemplateName
  const templateLanguage = mediaType === "document" ? config.documentShareTemplateLanguage : config.imageShareTemplateLanguage

  if (templateName) {
    const templateResult = await sendWhatsAppTemplateMedia(
      customer,
      order,
      mediaType,
      templateName,
      templateLanguage,
      link,
      filename,
      messageKind,
      sentBy,
    )
    if (templateResult.success) return templateResult
  }

  return sendWhatsAppMedia(customer, order, mediaType, link, filename, messageKind, sentBy)
}

export async function sendWhatsAppTestMessage(
  toRaw: string,
  templateName: string,
  language: string,
  sentBy: string | undefined,
): Promise<SendResult> {
  const config = await fetchWhatsAppConfig()
  if (!config.phoneNumberId) {
    return { success: false, error: "WhatsApp phone number ID is not configured" }
  }
  return invokeWhatsAppFunction({
    kind: "template",
    to: toRaw,
    phone_number_id: config.phoneNumberId,
    template_name: templateName,
    language,
    log: { message_kind: "test" satisfies WhatsAppMessageKind, sent_by: sentBy },
  })
}
