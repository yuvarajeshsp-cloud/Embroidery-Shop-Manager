import { fetchBusinessSettings } from "@/lib/config"
import {
  derivePaymentStatus,
  formatCurrency,
  formatDate,
  formatNumber,
  orderAmountPaid,
  orderBalanceDue,
  orderDiscountAmount,
  discountLabel,
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
  | { t: "row"; left: string; right: string; size?: ReceiptSize; bold?: boolean; muted?: boolean; keyed?: boolean }
  | { t: "divider" }
  | { t: "space"; h: number }
  | { t: "image"; src: string; maxWidth: number; maxHeight: number }
  /** The shop's header: the logo in the left 20%, the name and address in the right 80%. */
  | { t: "header"; src: string; lines: { text: string; size: ReceiptSize; bold?: boolean; muted?: boolean }[] }

export interface InvoiceData {
  order: Order
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
  additionalCosts?: OrderAdditionalCost[]
}

type Settings = Record<string, string>

/**
 * The shop's header, split in two columns: the logo fills the left 20% and the
 * name, address and contact take the right 80%. Without a logo the text simply
 * runs the full width. Used by the invoice and the order tag alike.
 */
function headerBlocks(settings: Settings): ReceiptBlock[] {
  const name = (settings.company_name || "").trim()
  const tagline = (settings.company_tagline || "").trim()
  const place = [
    (settings.company_address || "").trim(),
    [settings.company_city, settings.company_state, settings.company_pincode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ")
  const contact = [
    settings.company_phone ? `Ph: ${settings.company_phone.trim()}` : "",
    (settings.company_email || "").trim(),
    settings.company_gst_number ? `GST: ${settings.company_gst_number.trim()}` : "",
  ]
    .filter(Boolean)
    .join("  ")
  const lines: { text: string; size: ReceiptSize; bold?: boolean; muted?: boolean }[] = []
  if (name) lines.push({ text: name, size: "big", bold: true })
  if (tagline) lines.push({ text: tagline, size: "small", muted: true })
  if (place) lines.push({ text: place, size: "small" })
  if (contact) lines.push({ text: contact, size: "small" })
  const logo = (settings.company_logo_data_url || "").trim()
  if (logo.startsWith("data:image/")) return [{ t: "header", src: logo, lines }]
  return lines.map((l): ReceiptBlock => ({ t: "text", text: l.text, align: "center", size: l.size, bold: l.bold, muted: l.muted }))
}

export async function buildInvoiceBlocks(data: InvoiceData): Promise<ReceiptBlock[]> {
  const settings = await fetchBusinessSettings()
  const { order, customer, items, payments } = data
  const costs = data.additionalCosts || []
  const shop = isShopType(settings.shop_type) ? settings.shop_type : DEFAULT_SHOP_TYPE
  const extraLabel = vocabularyFor(shop).setupLabel.replace(/\s*\(.*\)$/, "")

  const setup = orderSetupCharges(items)
  const total = orderTotal(items, costs, order)
  const discountAmount = orderDiscountAmount(items, costs, order)
  // Everything listed above the line: the items and the costs under them.
  const subtotal = total + discountAmount - setup
  const paid = orderAmountPaid(payments)
  const balance = orderBalanceDue(items, payments, costs, order)
  const status = derivePaymentStatus(items, payments, costs, order)

  const b: ReceiptBlock[] = [...headerBlocks(settings)]
  b.push({ t: "divider" })
  b.push({ t: "text", text: "INVOICE", align: "center", size: "big", bold: true })
  b.push({ t: "row", left: "Order #", right: order.order_number, bold: true })
  b.push({ t: "row", left: "Order date", right: formatDate(order.order_date) })
  if (order.required_date) b.push({ t: "row", left: "Delivery date", right: formatDate(order.required_date) })
  b.push({ t: "divider" })
  const who = customer?.customer_business_name || "Walk-in Customer"
  if (customer?.phone) b.push({ t: "row", left: who, right: customer.phone, bold: true })
  else b.push({ t: "text", text: who, bold: true })
  if (customer?.contact_person && customer.contact_person !== who) {
    b.push({ t: "text", text: customer.contact_person, size: "small", muted: true })
  }
  b.push({ t: "divider" })

  items.forEach((item, idx) => {
    const desc = item.product_description || item.design_name_number || ""
    b.push({
      t: "row",
      left: `${idx + 1}. ${item.product_type}${desc ? ` - ${desc}` : ""}`,
      right: formatCurrency(orderItemTotal(item)),
      bold: true,
    })
    // The working line is only worth a line when it says more than the total does.
    const qty = Number(item.quantity)
    const stitches = pricingModeOf(item) === "stitch" && item.stitches_per_unit > 0 && item.manual_unit_price == null
    if (qty !== 1 || stitches) {
      const parts = [`${qty} x ${formatCurrency(orderItemUnitPrice(item))}`]
      if (stitches) parts.push(`${formatNumber(item.stitches_per_unit)} stitches`)
      b.push({ t: "text", text: parts.join(" · "), size: "small", muted: true })
    }
    // This item's additional costs sit right under it, above the subtotal.
    for (const c of costs.filter((x) => x.order_item_id === item.id)) {
      b.push({ t: "row", left: `+ ${c.cost_type}`, right: formatCurrency(c.amount), size: "small" })
    }
    b.push({ t: "space", h: 4 })
  })
  // Costs that don't belong to any item shown here.
  for (const c of costs.filter((x) => !items.some((i) => i.id === x.order_item_id))) {
    b.push({ t: "row", left: `+ ${c.cost_type}`, right: formatCurrency(c.amount), size: "small" })
  }

  b.push({ t: "divider" })
  // The subtotal only earns a line when something is added or taken off it.
  if (setup > 0 || discountAmount > 0) b.push({ t: "row", left: "Subtotal", right: formatCurrency(subtotal) })
  if (setup > 0) b.push({ t: "row", left: extraLabel, right: formatCurrency(setup) })
  if (discountAmount > 0) {
    b.push({ t: "row", left: `Discount (${discountLabel(order)})`, right: `-${formatCurrency(discountAmount)}` })
  }
  b.push({ t: "row", left: "TOTAL", right: formatCurrency(total), size: "big", bold: true })
  if (balance <= 0 && paid > 0) {
    b.push({ t: "row", left: "PAID IN FULL", right: formatCurrency(paid), bold: true })
  } else {
    if (paid > 0) b.push({ t: "row", left: "Paid", right: formatCurrency(paid) })
    b.push({ t: "row", left: `Balance Due${paid > 0 ? "" : ` (${status})`}`, right: formatCurrency(balance), bold: true })
  }
  b.push({ t: "text", text: "Thank you for your business!", align: "center", size: "small", muted: true })
  return b
}

export async function buildOrderTagBlocks(order: Order, customer: Customer | null): Promise<ReceiptBlock[]> {
  const settings = await fetchBusinessSettings()
  const b: ReceiptBlock[] = [...headerBlocks(settings)]
  b.push({ t: "divider" })
  b.push({ t: "text", text: "ORDER TAG", align: "center", size: "big", bold: true })
  b.push({ t: "divider" })
  // Each caption and its value share a line.
  b.push({ t: "row", left: "Order Number", right: order.order_number, size: "big", bold: true, keyed: true })
  b.push({ t: "divider" })
  const field = (label: string, value: string) => b.push({ t: "row", left: label, right: value || "—", keyed: true })
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
type Drawable = HTMLImageElement | HTMLCanvasElement

function logoToDots(img: Drawable, w: number, h: number): HTMLCanvasElement {
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

/**
 * Cuts the empty white (or transparent) border off a logo. Many logo files
 * carry a wide margin, which would waste paper and push the shop name aside.
 */
function trimMargins(img: HTMLImageElement): Drawable {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) return img
  const probe = document.createElement("canvas")
  probe.width = w
  probe.height = h
  const ctx = probe.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4
      const ink = data[p + 3] > 32 && (data[p] + data[p + 1] + data[p + 2]) / 3 < 240
      if (ink) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return img
  const pad = 2
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const sw = Math.min(w, maxX + pad + 1) - sx
  const sh = Math.min(h, maxY + pad + 1) - sy
  if (sw >= w * 0.98 && sh >= h * 0.98) return img
  const out = document.createElement("canvas")
  out.width = sw
  out.height = sh
  out.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
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
  const top = (border ? 12 : 6) + topSpace
  const bottom = border ? 16 : 6
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
  const images = new Map<number, Drawable>()
  await Promise.all(
    blocks.map(async (blk, i) => {
      if (blk.t === "image" || blk.t === "header") {
        const img = await loadImage(blk.src)
        if (img) images.set(i, trimMargins(img))
      }
    }),
  )

  const lineHeight = (size: ReceiptSize) => Math.round(SIZE_PX[size] * 1.4)

  // A keyed row has a plain caption and a bold value; the pair stacks when it can't fit on one line.
  const keyedFits = (blk: Extract<ReceiptBlock, { t: "row" }>) => {
    const size = blk.size || "normal"
    measure.font = fontFor(size, false)
    const l = measure.measureText(blk.left).width
    measure.font = fontFor(size, true)
    return l + measure.measureText(blk.right).width + 16 <= inner
  }

  // The header: logo in the left 20% of the width, text in the right 80%.
  const leftW = Math.round(inner * 0.2)
  const rightW = inner - leftW
  const headerParts = (blk: Extract<ReceiptBlock, { t: "header" }>, i: number) => {
    const img = images.get(i)
    const logo = img ? scaled(img, leftW - 8, Math.round(130 * scale)) : null
    const lines = blk.lines.flatMap((l) =>
      wrap(l.text, l.size, l.bold, rightW - 8).map((text) => ({ ...l, text })),
    )
    const textH = lines.reduce((n, l) => n + lineHeight(l.size), 0)
    return { img, logo, lines, textH, rowH: Math.max(textH, logo?.h ?? 0) }
  }

  // Layout pass.
  let height = top
  for (const [i, blk] of blocks.entries()) {
    if (blk.t === "text") height += wrap(blk.text, blk.size || "normal", blk.bold, inner).length * lineHeight(blk.size || "normal")
    else if (blk.t === "row" && blk.keyed) {
      height += (keyedFits(blk) ? 1 : 2) * lineHeight(blk.size || "normal")
    } else if (blk.t === "row") {
      const size = blk.size || "normal"
      measure.font = fontFor(size, blk.bold)
      const rightW = measure.measureText(blk.right).width
      height += wrap(blk.left, size, blk.bold, Math.max(80, inner - rightW - 12)).length * lineHeight(size)
    } else if (blk.t === "header") {
      height += headerParts(blk, i).rowH + 4
    } else if (blk.t === "divider") height += 18
    else if (blk.t === "space") height += blk.h
    else if (blk.t === "image") {
      const img = images.get(i)
      if (img) height += scaled(img, blk.maxWidth * scale, blk.maxHeight * scale).h + 4
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
    } else if (blk.t === "row" && blk.keyed) {
      const size = blk.size || "normal"
      const fits = keyedFits(blk)
      ctx.fillStyle = "#000"
      ctx.font = fontFor(size, false)
      ctx.fillText(blk.left, margin, y)
      ctx.font = fontFor(size, true)
      const rightW = ctx.measureText(blk.right).width
      if (fits) {
        ctx.fillText(blk.right, width - margin - rightW, y)
        y += lineHeight(size)
      } else {
        y += lineHeight(size)
        ctx.fillText(blk.right, width - margin - rightW, y)
        y += lineHeight(size)
      }
    } else if (blk.t === "header") {
      const { img, logo, lines, textH, rowH } = headerParts(blk, i)
      if (img && logo) ctx.drawImage(logoToDots(img, logo.w, logo.h), margin + (leftW - logo.w) / 2, y + (rowH - logo.h) / 2)
      ctx.fillStyle = "#000"
      let ty = y + (rowH - textH) / 2
      for (const l of lines) {
        ctx.font = fontFor(l.size, l.bold)
        ctx.fillStyle = l.muted ? "#333" : "#000"
        const w = ctx.measureText(l.text).width
        ctx.fillText(l.text, margin + leftW + (rightW - w) / 2, ty)
        ty += lineHeight(l.size)
      }
      y += rowH + 4
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
        y += h + 4
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

function scaled(img: Drawable, maxW: number, maxH: number) {
  const r = Math.min(maxW / img.width, maxH / img.height, 1)
  return { w: Math.max(1, Math.round(img.width * r)), h: Math.max(1, Math.round(img.height * r)) }
}
