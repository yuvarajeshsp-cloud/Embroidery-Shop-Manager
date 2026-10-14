import { fetchBusinessSettings } from "@/lib/config"
import {
  derivePaymentStatus,
  formatCurrency,
  formatDate,
  formatNumber,
  orderAdditionalCostsTotal,
  orderAmountPaid,
  orderBalanceDue,
  orderItemTotal,
  orderItemUnitPrice,
  orderSetupCharges,
  orderTotal,
} from "@/lib/helpers"
import { DEFAULT_SHOP_TYPE, isShopType } from "@/lib/shop-type-core"
import { pricingModeOf, vocabularyFor } from "@/lib/shop-type"
import type { Customer, Order, OrderAdditionalCost, OrderItem, Payment } from "@/lib/types"

// A receipt is described once, as a list of blocks, then drawn onto a canvas
// at the printer's dot width. Drawing it ourselves (instead of capturing HTML)
// keeps the output sharp, supports any script the device has a font for, and
// does not depend on the page's styles.

export type ReceiptSize = "small" | "normal" | "big" | "huge"

export type ReceiptBlock =
  | { t: "text"; text: string; align?: "left" | "center" | "right"; size?: ReceiptSize; bold?: boolean; muted?: boolean }
  | { t: "row"; left: string; right: string; size?: ReceiptSize; bold?: boolean; muted?: boolean }
  | { t: "divider" }
  | { t: "space"; h: number }
  | { t: "image"; src: string; maxWidth: number; maxHeight: number }

export interface InvoiceData {
  order: Order
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
  additionalCosts?: OrderAdditionalCost[]
}

type Settings = Record<string, string>

function headerBlocks(settings: Settings): ReceiptBlock[] {
  const name = (settings.company_name || "").trim()
  const tagline = (settings.company_tagline || "").trim()
  const cityLine = [settings.company_city, settings.company_state, settings.company_pincode].filter(Boolean).join(", ")
  const lines = [
    (settings.company_address || "").trim(),
    cityLine,
    settings.company_phone ? `Ph: ${settings.company_phone.trim()}` : "",
    (settings.company_email || "").trim(),
    settings.company_gst_number ? `GST: ${settings.company_gst_number.trim()}` : "",
  ].filter(Boolean)
  const blocks: ReceiptBlock[] = []
  const logo = (settings.company_logo_data_url || "").trim()
  if (logo.startsWith("data:image/")) blocks.push({ t: "image", src: logo, maxWidth: 200, maxHeight: 120 })
  if (name) blocks.push({ t: "text", text: name, align: "center", size: "big", bold: true })
  if (tagline) blocks.push({ t: "text", text: tagline, align: "center", size: "small", muted: true })
  for (const line of lines) blocks.push({ t: "text", text: line, align: "center", size: "small" })
  return blocks
}

export async function buildInvoiceBlocks(data: InvoiceData): Promise<ReceiptBlock[]> {
  const settings = await fetchBusinessSettings()
  const { order, customer, items, payments } = data
  const costs = data.additionalCosts || []
  const shop = isShopType(settings.shop_type) ? settings.shop_type : DEFAULT_SHOP_TYPE
  const extraLabel = vocabularyFor(shop).setupLabel.replace(/\s*\(.*\)$/, "")

  const setup = orderSetupCharges(items)
  const total = orderTotal(items, costs)
  const subtotal = total - setup - orderAdditionalCostsTotal(costs)
  const paid = orderAmountPaid(payments)
  const balance = orderBalanceDue(items, payments, costs)
  const status = derivePaymentStatus(items, payments, costs)

  const b: ReceiptBlock[] = [...headerBlocks(settings)]
  b.push({ t: "divider" })
  b.push({ t: "text", text: "INVOICE", align: "center", size: "big", bold: true })
  b.push({ t: "row", left: "Order #", right: order.order_number, bold: true })
  b.push({ t: "row", left: "Date", right: formatDate(order.order_date) })
  if (order.required_date) b.push({ t: "row", left: "Delivery", right: formatDate(order.required_date) })
  b.push({ t: "divider" })
  b.push({ t: "text", text: customer?.customer_business_name || "Walk-in Customer", bold: true })
  if (customer?.contact_person) b.push({ t: "text", text: customer.contact_person, size: "small" })
  if (customer?.phone) b.push({ t: "text", text: `Ph: ${customer.phone}`, size: "small" })
  b.push({ t: "divider" })

  items.forEach((item, idx) => {
    const desc = item.product_description || item.design_name_number || ""
    b.push({ t: "text", text: `${idx + 1}. ${item.product_type}`, bold: true })
    if (desc) b.push({ t: "text", text: desc, size: "small", muted: true })
    if (pricingModeOf(item) === "stitch" && item.stitches_per_unit > 0 && item.manual_unit_price == null) {
      b.push({ t: "text", text: `${formatNumber(item.stitches_per_unit)} stitches`, size: "small", muted: true })
    }
    b.push({
      t: "row",
      left: `${Number(item.quantity)} x ${formatCurrency(orderItemUnitPrice(item))}`,
      right: formatCurrency(orderItemTotal(item)),
    })
  })

  b.push({ t: "divider" })
  b.push({ t: "row", left: "Subtotal", right: formatCurrency(subtotal) })
  if (setup > 0) b.push({ t: "row", left: extraLabel, right: formatCurrency(setup) })
  for (const c of costs) b.push({ t: "row", left: c.cost_type, right: formatCurrency(c.amount) })
  b.push({ t: "row", left: "TOTAL", right: formatCurrency(total), size: "big", bold: true })
  b.push({ t: "row", left: "Paid", right: formatCurrency(paid) })
  b.push({ t: "row", left: "Balance Due", right: formatCurrency(balance), bold: true })
  b.push({ t: "row", left: "Payment Status", right: status, bold: true })
  b.push({ t: "space", h: 10 })
  b.push({ t: "text", text: "Thank you for your business!", align: "center", size: "small" })
  b.push({ t: "text", text: formatDate(new Date()), align: "center", size: "small", muted: true })
  return b
}

export async function buildOrderTagBlocks(order: Order, customer: Customer | null): Promise<ReceiptBlock[]> {
  const settings = await fetchBusinessSettings()
  const b: ReceiptBlock[] = [...headerBlocks(settings)]
  b.push({ t: "divider" })
  b.push({ t: "text", text: "ORDER TAG", align: "center", size: "big", bold: true })
  b.push({ t: "divider" })
  b.push({ t: "text", text: "Order Number", size: "small", muted: true })
  b.push({ t: "text", text: order.order_number, size: "huge", bold: true })
  b.push({ t: "divider" })
  const field = (label: string, value: string) => {
    b.push({ t: "text", text: label, size: "small", muted: true })
    b.push({ t: "text", text: value || "—", bold: true })
    b.push({ t: "space", h: 6 })
  }
  field("Business Name", customer?.customer_business_name || "")
  field("Contact Person", customer?.contact_person || "")
  field("Phone Number", customer?.phone || "")
  if (order.required_date) field("Delivery Date", formatDate(order.required_date))
  if (order.trial_date) field("Trial / Fitting", formatDate(order.trial_date))
  b.push({ t: "divider" })
  return b
}

// --- drawing ---------------------------------------------------------------

const FONT_FAMILY = `system-ui, -apple-system, "Segoe UI", "Noto Sans", "Noto Sans Tamil", "Noto Sans Devanagari", Roboto, Arial, sans-serif`
const SIZE_PX: Record<ReceiptSize, number> = { small: 20, normal: 23, big: 30, huge: 46 }

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Draws blocks onto a white canvas `width` dots wide, as tall as the content needs. */
export async function renderReceipt(blocks: ReceiptBlock[], width = 576): Promise<HTMLCanvasElement> {
  const margin = 10
  const inner = width - margin * 2
  const measure = document.createElement("canvas").getContext("2d")!
  const fontFor = (size: ReceiptSize, bold?: boolean) => `${bold ? "700" : "400"} ${SIZE_PX[size]}px ${FONT_FAMILY}`

  const wrap = (text: string, size: ReceiptSize, bold: boolean | undefined, maxWidth: number): string[] => {
    measure.font = fontFor(size, bold)
    const out: string[] = []
    for (const para of String(text).split("\n")) {
      let line = ""
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const attempt = line ? `${line} ${word}` : word
        if (measure.measureText(attempt).width <= maxWidth || !line) {
          line = attempt
        } else {
          out.push(line)
          line = word
        }
      }
      out.push(line)
    }
    return out
  }

  // Pre-load images so heights are known.
  const images = new Map<number, HTMLImageElement>()
  await Promise.all(
    blocks.map(async (blk, i) => {
      if (blk.t === "image") {
        const img = await loadImage(blk.src)
        if (img) images.set(i, img)
      }
    }),
  )

  const lineHeight = (size: ReceiptSize) => Math.round(SIZE_PX[size] * 1.35)

  // Layout pass.
  let height = 12
  for (const [i, blk] of blocks.entries()) {
    if (blk.t === "text") height += wrap(blk.text, blk.size || "normal", blk.bold, inner).length * lineHeight(blk.size || "normal")
    else if (blk.t === "row") {
      const size = blk.size || "normal"
      measure.font = fontFor(size, blk.bold)
      const rightW = measure.measureText(blk.right).width
      height += wrap(blk.left, size, blk.bold, Math.max(80, inner - rightW - 12)).length * lineHeight(size)
    } else if (blk.t === "divider") height += 18
    else if (blk.t === "space") height += blk.h
    else if (blk.t === "image") {
      const img = images.get(i)
      if (img) height += scaled(img, blk.maxWidth, blk.maxHeight).h + 8
    }
  }
  height += 12

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = "top"

  let y = 12
  for (const [i, blk] of blocks.entries()) {
    if (blk.t === "text") {
      const size = blk.size || "normal"
      ctx.font = fontFor(size, blk.bold)
      ctx.fillStyle = blk.muted ? "#333" : "#000"
      for (const line of wrap(blk.text, size, blk.bold, inner)) {
        const w = ctx.measureText(line).width
        const x = blk.align === "center" ? (width - w) / 2 : blk.align === "right" ? width - margin - w : margin
        ctx.fillText(line, x, y)
        y += lineHeight(size)
      }
    } else if (blk.t === "row") {
      const size = blk.size || "normal"
      ctx.font = fontFor(size, blk.bold)
      ctx.fillStyle = blk.muted ? "#333" : "#000"
      const rightW = ctx.measureText(blk.right).width
      const lines = wrap(blk.left, size, blk.bold, Math.max(80, inner - rightW - 12))
      lines.forEach((line, n) => {
        ctx.fillText(line, margin, y + n * lineHeight(size))
      })
      ctx.fillText(blk.right, width - margin - rightW, y)
      y += lines.length * lineHeight(size)
    } else if (blk.t === "divider") {
      ctx.fillStyle = "#000"
      for (let x = margin; x < width - margin; x += 10) ctx.fillRect(x, y + 8, 5, 2)
      y += 18
    } else if (blk.t === "space") {
      y += blk.h
    } else if (blk.t === "image") {
      const img = images.get(i)
      if (img) {
        const { w, h } = scaled(img, blk.maxWidth, blk.maxHeight)
        ctx.drawImage(img, (width - w) / 2, y, w, h)
        y += h + 8
      }
    }
  }
  return canvas
}

function scaled(img: HTMLImageElement, maxW: number, maxH: number) {
  const r = Math.min(maxW / img.width, maxH / img.height, 1)
  return { w: Math.max(1, Math.round(img.width * r)), h: Math.max(1, Math.round(img.height * r)) }
}
