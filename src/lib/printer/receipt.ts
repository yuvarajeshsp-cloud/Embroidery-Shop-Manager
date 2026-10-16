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
  if (logo.startsWith("data:image/")) blocks.push({ t: "image", src: logo, maxWidth: 230, maxHeight: 150 })
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

/**
 * A logo as pure black and white dots. Light or coloured artwork (a gold logo
 * on white, say) is lighter than a plain black/white cut-off would keep, so
 * it vanished from the print. The picture is stretched to use the full
 * dark-to-light range, then dithered so mid-tones become fine dot patterns.
 */
function logoToDots(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement("canvas")
  out.width = w
  out.height = h
  const ctx = out.getContext("2d", { willReadFrequently: true })!
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4
    gray[i] = 0.299 * image.data[p] + 0.587 * image.data[p + 1] + 0.114 * image.data[p + 2]
  }
  // Stretch between the 2nd and 98th percentile so one stray pixel can't flatten the range.
  const sorted = Float32Array.from(gray).sort()
  const lo = sorted[Math.floor(sorted.length * 0.02)]
  const hi = sorted[Math.floor(sorted.length * 0.98)]
  const span = Math.max(1, hi - lo)
  for (let i = 0; i < gray.length; i++) gray[i] = Math.max(0, Math.min(255, ((gray[i] - lo) / span) * 255))
  // Floyd–Steinberg error diffusion.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const old = gray[i]
      const val = old < 128 ? 0 : 255
      gray[i] = val
      const err = old - val
      if (x + 1 < w) gray[i + 1] += (err * 7) / 16
      if (y + 1 < h) {
        if (x > 0) gray[i + w - 1] += (err * 3) / 16
        gray[i + w] += (err * 5) / 16
        if (x + 1 < w) gray[i + w + 1] += err / 16
      }
    }
  }
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4
    image.data[p] = image.data[p + 1] = image.data[p + 2] = gray[i]
    image.data[p + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return out
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Draws blocks onto a white canvas `width` dots wide, as tall as the content needs. */
export async function renderReceipt(
  blocks: ReceiptBlock[],
  width = 576,
  opts: { border?: boolean; topSpace?: number } = {},
): Promise<HTMLCanvasElement> {
  const { border = true, topSpace = 0 } = opts
  // A frame is drawn round the receipt; the text sits inside it. It is kept off the
  // very edge because most printers cannot print the outermost dots.
  const frameInset = 6
  const frameWidth = 3
  const margin = border ? 26 : 10
  // Paper starts right at the print head, so nothing is added above the frame.
  const top = (border ? 16 : 8) + topSpace
  const bottom = border ? 16 : 8
  const inner = width - margin * 2
  // Logos are sized for an 80mm (576-dot) roll and scale with the paper.
  const scale = width / 576
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
  let height = top
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
      if (img) height += scaled(img, blk.maxWidth * scale, blk.maxHeight * scale).h + 8
    }
  }
  height += bottom

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = "top"

  let y = top
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
        const { w, h } = scaled(img, blk.maxWidth * scale, blk.maxHeight * scale)
        ctx.drawImage(logoToDots(img, w, h), (width - w) / 2, y)
        y += h + 8
      }
    }
  }
  if (border) {
    ctx.strokeStyle = "#000"
    ctx.lineWidth = frameWidth
    ctx.lineJoin = "round"
    ctx.beginPath()
    // Sits at the very top (the paper's leading edge), inset from the sides and bottom.
    const x = frameInset + frameWidth / 2
    const frameTop = topSpace + frameWidth / 2
    ctx.roundRect(x, frameTop, width - 2 * frameInset - frameWidth, height - frameTop - frameInset - frameWidth / 2, 14)
    ctx.stroke()
  }
  return canvas
}

function scaled(img: HTMLImageElement, maxW: number, maxH: number) {
  const r = Math.min(maxW / img.width, maxH / img.height, 1)
  return { w: Math.max(1, Math.round(img.width * r)), h: Math.max(1, Math.round(img.height * r)) }
}
