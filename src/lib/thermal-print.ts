import { jsPDF } from "jspdf"
import { Capacitor } from "@capacitor/core"
import { fetchBusinessSettings } from "./config"
import { shareFile, formatPdfCurrency } from "./pdf"
import { DEFAULT_SHOP_TYPE, isShopType, vocabularyFor } from "./shop-type"
import {
  formatCurrency,
  formatDate,
  orderItemUnitPrice,
  orderItemTotal,
  orderTotal,
  orderSetupCharges,
  orderAdditionalCostsTotal,
  orderAmountPaid,
  orderBalanceDue,
  derivePaymentStatus,
} from "./helpers"
import type { Order, OrderItem, OrderAdditionalCost, Payment, Customer } from "./types"

export interface ThermalInvoiceData {
  order: Order
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
  additionalCosts?: OrderAdditionalCost[]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildThermalDocumentHtml(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<title>${escapeHtml(title)}</title>
<meta charset="utf-8" />
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: 80mm;
    margin: 0;
    padding: 3mm 4mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    line-height: 1.4;
    color: #000;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .muted { color: #444; }
  .divider { border-top: 1px dashed #000; margin: 5px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .logo { max-width: 34mm; max-height: 18mm; margin: 0 auto 3px; display: block; }
  h1 { font-size: 14px; margin: 2px 0; }
  h2 { font-size: 11px; margin: 6px 0 2px; letter-spacing: 1px; }
  p { margin: 1px 0; }
  .small { font-size: 9px; }
  .big { font-size: 16px; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`
}

// Renders the given body HTML in a hidden iframe sized for an 80mm thermal
// roll and triggers the browser's native print dialog. Using the OS print
// pipeline (rather than raw ESC/POS commands) means it works with any
// printer already set up on the machine, thermal or not.
function printThermalHtml(bodyHtml: string, title: string) {
  const frame = document.createElement("iframe")
  frame.style.position = "fixed"
  frame.style.right = "0"
  frame.style.bottom = "0"
  frame.style.width = "0"
  frame.style.height = "0"
  frame.style.border = "0"
  document.body.appendChild(frame)

  const doc = frame.contentWindow?.document
  if (!doc) {
    document.body.removeChild(frame)
    return
  }

  doc.open()
  doc.write(buildThermalDocumentHtml(bodyHtml, title))
  doc.close()

  // A short delay lets the (possibly async-loaded) logo image and layout
  // settle before the print dialog captures the page.
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => {
      if (frame.parentNode) document.body.removeChild(frame)
    }, 1000)
  }, 300)
}

// Draws a thermal-receipt-style PDF using jsPDF's own text/line drawing
// (not html2canvas): the app's Tailwind theme uses oklch() colors globally,
// which html2canvas cannot parse — even rendered inside an isolated iframe,
// it still pulls the CSS through and throws. Direct drawing sidesteps that
// entirely and mirrors the exact content of the HTML receipt used for the
// desktop print/preview, just via jsPDF calls instead of CSS.
const THERMAL_WIDTH_MM = 80
const THERMAL_MARGIN_MM = 4
const THERMAL_CONTENT_WIDTH_MM = THERMAL_WIDTH_MM - THERMAL_MARGIN_MM * 2
const THERMAL_DARK: [number, number, number] = [0, 0, 0]
const THERMAL_MUTED: [number, number, number] = [70, 70, 70]

function drawThermalDivider(doc: jsPDF, y: number): number {
  doc.setDrawColor(...THERMAL_MUTED)
  doc.setLineDashPattern([0.8, 0.8], 0)
  doc.line(THERMAL_MARGIN_MM, y, THERMAL_WIDTH_MM - THERMAL_MARGIN_MM, y)
  doc.setLineDashPattern([], 0)
  return y + 4
}

function drawThermalRow(doc: jsPDF, label: string, value: string, y: number, bold: boolean): number {
  doc.setFont("courier", bold ? "bold" : "normal")
  doc.setTextColor(...(bold ? THERMAL_DARK : THERMAL_MUTED))
  doc.text(label, THERMAL_MARGIN_MM, y)
  doc.setTextColor(...THERMAL_DARK)
  doc.text(value, THERMAL_WIDTH_MM - THERMAL_MARGIN_MM, y, { align: "right" })
  return y + 4
}

type BusinessSettings = Record<string, string>

function drawThermalHeader(doc: jsPDF, y: number, settings: BusinessSettings): number {
  const name = (settings.company_name || "Business Management System").trim()
  const tagline = (settings.company_tagline || "").trim()
  const phone = (settings.company_phone || "").trim()
  const email = (settings.company_email || "").trim()
  const address = (settings.company_address || "").trim()
  const cityLine = [settings.company_city, settings.company_state, settings.company_pincode].filter(Boolean).join(", ")
  const gst = (settings.company_gst_number || "").trim()
  const logo = (settings.company_logo_data_url || "").trim()

  if (logo && logo.startsWith("data:image/")) {
    try {
      const format = logo.includes("image/png") ? "PNG" : "JPEG"
      const logoW = 22
      const logoH = 14
      doc.addImage(logo, format, (THERMAL_WIDTH_MM - logoW) / 2, y, logoW, logoH)
      y += logoH + 2
    } catch {
      // If the logo fails to embed, continue without it
    }
  }

  doc.setFont("courier", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...THERMAL_DARK)
  doc.text(name, THERMAL_WIDTH_MM / 2, y, { align: "center" })
  y += 4.6

  doc.setFont("courier", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...THERMAL_MUTED)
  const lines = [tagline, address, cityLine, phone ? `Ph: ${phone}` : "", email, gst ? `GST: ${gst}` : ""].filter(Boolean)
  for (const line of lines) {
    doc.text(line, THERMAL_WIDTH_MM / 2, y, { align: "center" })
    y += 3.4
  }

  return y + 1
}

// jsPDF renders a fixed-size page and does not reflow content that runs past
// the bottom edge onto a new page — it silently draws off-page instead, which
// clips whatever comes after. Since the header's height varies with which
// business-settings fields are filled in, we can't reliably precompute the
// page height up front. Instead we draw once on an oversized scratch page to
// measure how far the content actually goes, then draw again on a page sized
// to fit that content exactly.
function extraLabel(settings: Record<string, string>): string {
  const shop = isShopType(settings.shop_type) ? settings.shop_type : DEFAULT_SHOP_TYPE
  return vocabularyFor(shop).setupLabel.replace(/\s*\(.*\)$/, "")
}

function drawThermalInvoiceContent(doc: jsPDF, data: ThermalInvoiceData, settings: BusinessSettings): number {
  const { order, customer, items, payments } = data
  const additionalCosts = data.additionalCosts || []

  const setup = orderSetupCharges(items)
  const total = orderTotal(items, additionalCosts)
  const subtotal = total - setup - orderAdditionalCostsTotal(additionalCosts)
  const paid = orderAmountPaid(payments)
  const balance = orderBalanceDue(items, payments, additionalCosts)
  const payStatus = derivePaymentStatus(items, payments, additionalCosts)

  let y = 6
  y = drawThermalHeader(doc, y, settings)
  y = drawThermalDivider(doc, y)

  doc.setFont("courier", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...THERMAL_DARK)
  doc.text("INVOICE", THERMAL_WIDTH_MM / 2, y, { align: "center" })
  y += 5

  doc.setFontSize(8.5)
  y = drawThermalRow(doc, "Order #", order.order_number, y, true)
  y = drawThermalRow(doc, "Date", formatDate(order.order_date), y, false)
  y = drawThermalDivider(doc, y)

  doc.setFont("courier", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...THERMAL_DARK)
  doc.text(customer?.customer_business_name || "Walk-in Customer", THERMAL_MARGIN_MM, y)
  y += 4
  doc.setFont("courier", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...THERMAL_MUTED)
  if (customer?.contact_person) {
    doc.text(customer.contact_person, THERMAL_MARGIN_MM, y)
    y += 3.6
  }
  if (customer?.phone) {
    doc.text(`Ph: ${customer.phone}`, THERMAL_MARGIN_MM, y)
    y += 3.6
  }
  y = drawThermalDivider(doc, y)

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    doc.setFont("courier", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(...THERMAL_DARK)
    doc.text(`${idx + 1}. ${item.product_type}`, THERMAL_MARGIN_MM, y)
    y += 3.8

    const desc = item.product_description || item.design_name_number || ""
    if (desc) {
      doc.setFont("courier", "normal")
      doc.setFontSize(7.5)
      doc.setTextColor(...THERMAL_MUTED)
      const descLines = doc.splitTextToSize(desc, THERMAL_CONTENT_WIDTH_MM) as string[]
      doc.text(descLines[0] || "", THERMAL_MARGIN_MM, y)
      y += 3.6
    }

    doc.setFont("courier", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...THERMAL_DARK)
    doc.text(`${item.quantity} x ${formatPdfCurrency(orderItemUnitPrice(item))}`, THERMAL_MARGIN_MM, y)
    doc.text(formatPdfCurrency(orderItemTotal(item)), THERMAL_WIDTH_MM - THERMAL_MARGIN_MM, y, { align: "right" })
    y += 4.4
  }

  y = drawThermalDivider(doc, y)
  doc.setFontSize(8.5)
  y = drawThermalRow(doc, "Subtotal", formatPdfCurrency(subtotal), y, false)
  if (setup > 0) y = drawThermalRow(doc, extraLabel(settings), formatPdfCurrency(setup), y, false)
  for (const cost of additionalCosts) {
    const label = cost.notes ? `${cost.cost_type} (${cost.notes})` : cost.cost_type
    y = drawThermalRow(doc, label.length > 22 ? `${label.slice(0, 21)}…` : label, formatPdfCurrency(cost.amount), y, false)
  }
  doc.setFontSize(10)
  y = drawThermalRow(doc, "TOTAL", formatPdfCurrency(total), y, true)
  doc.setFontSize(8.5)
  y = drawThermalRow(doc, "Paid", formatPdfCurrency(paid), y, false)
  y = drawThermalRow(doc, "Balance Due", formatPdfCurrency(balance), y, true)
  y = drawThermalRow(doc, "Payment Status", payStatus, y, true)
  y = drawThermalDivider(doc, y)

  doc.setFont("courier", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...THERMAL_MUTED)
  doc.text("Thank you for your business!", THERMAL_WIDTH_MM / 2, y, { align: "center" })
  y += 3.4
  doc.text(formatDate(new Date()), THERMAL_WIDTH_MM / 2, y, { align: "center" })
  y += 3.4

  return y
}

// Scratch page tall enough that no realistic receipt content runs past it
// during the measurement pass.
const THERMAL_SCRATCH_HEIGHT_MM = 500
const THERMAL_BOTTOM_MARGIN_MM = 6

async function generateThermalInvoicePdf(data: ThermalInvoiceData): Promise<Blob> {
  const settings = await fetchBusinessSettings()

  const scratch = new jsPDF({ unit: "mm", format: [THERMAL_WIDTH_MM, THERMAL_SCRATCH_HEIGHT_MM] })
  const measuredY = drawThermalInvoiceContent(scratch, data, settings)

  const doc = new jsPDF({ unit: "mm", format: [THERMAL_WIDTH_MM, measuredY + THERMAL_BOTTOM_MARGIN_MM] })
  drawThermalInvoiceContent(doc, data, settings)

  return doc.output("blob")
}

function drawThermalOrderTagContent(
  doc: jsPDF,
  order: Order,
  customer: Customer | null,
  settings: BusinessSettings,
): number {
  let y = 6
  y = drawThermalHeader(doc, y, settings)
  y = drawThermalDivider(doc, y)

  doc.setFont("courier", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...THERMAL_DARK)
  doc.text("ORDER TAG", THERMAL_WIDTH_MM / 2, y, { align: "center" })
  y = drawThermalDivider(doc, y + 3)

  doc.setFont("courier", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...THERMAL_MUTED)
  doc.text("Order Number", THERMAL_MARGIN_MM, y)
  y += 6
  doc.setFont("courier", "bold")
  doc.setFontSize(16)
  doc.setTextColor(...THERMAL_DARK)
  doc.text(order.order_number, THERMAL_MARGIN_MM, y)
  y = drawThermalDivider(doc, y + 3)

  const field = (label: string, value: string) => {
    doc.setFont("courier", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...THERMAL_MUTED)
    doc.text(label, THERMAL_MARGIN_MM, y)
    y += 4
    doc.setFont("courier", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...THERMAL_DARK)
    doc.text(value, THERMAL_MARGIN_MM, y)
    y += 5
  }

  field("Business Name", customer?.customer_business_name || "—")
  field("Contact Person", customer?.contact_person || "—")
  field("Phone Number", customer?.phone || "—")

  return y
}

async function generateThermalOrderTagPdf(order: Order, customer: Customer | null): Promise<Blob> {
  const settings = await fetchBusinessSettings()

  const scratch = new jsPDF({ unit: "mm", format: [THERMAL_WIDTH_MM, THERMAL_SCRATCH_HEIGHT_MM] })
  const measuredY = drawThermalOrderTagContent(scratch, order, customer, settings)

  const doc = new jsPDF({ unit: "mm", format: [THERMAL_WIDTH_MM, measuredY + THERMAL_BOTTOM_MARGIN_MM] })
  drawThermalOrderTagContent(doc, order, customer, settings)

  return doc.output("blob")
}

async function businessHeaderHtml(): Promise<string> {
  const settings = await fetchBusinessSettings()
  const name = (settings.company_name || "Business Management System").trim()
  const tagline = (settings.company_tagline || "").trim()
  const phone = (settings.company_phone || "").trim()
  const email = (settings.company_email || "").trim()
  const address = (settings.company_address || "").trim()
  const cityLine = [settings.company_city, settings.company_state, settings.company_pincode]
    .filter(Boolean)
    .join(", ")
  const gst = (settings.company_gst_number || "").trim()
  const logo = (settings.company_logo_data_url || "").trim()

  const lines = [address, cityLine, phone ? `Ph: ${phone}` : "", email, gst ? `GST: ${gst}` : ""].filter(Boolean)

  return `
    <div class="center">
      ${logo ? `<img class="logo" src="${logo}" alt="${escapeHtml(name)}" />` : ""}
      <h1>${escapeHtml(name)}</h1>
      ${tagline ? `<p class="small">${escapeHtml(tagline)}</p>` : ""}
      ${lines.map((l) => `<p class="small">${escapeHtml(l)}</p>`).join("")}
    </div>
  `
}

async function buildInvoiceBody(data: ThermalInvoiceData): Promise<string> {
  const { order, customer, items, payments } = data
  const header = await businessHeaderHtml()
  const settings = await fetchBusinessSettings()

  const additionalCosts = data.additionalCosts || []
  const setup = orderSetupCharges(items)
  const total = orderTotal(items, additionalCosts)
  const subtotal = total - setup - orderAdditionalCostsTotal(additionalCosts)
  const paid = orderAmountPaid(payments)
  const balance = orderBalanceDue(items, payments, additionalCosts)
  const payStatus = derivePaymentStatus(items, payments, additionalCosts)
  const costRows = additionalCosts
    .map(
      (c) =>
        `<div class="row"><span>${escapeHtml(c.notes ? `${c.cost_type} (${c.notes})` : c.cost_type)}</span><span>${formatCurrency(c.amount)}</span></div>`,
    )
    .join("")

  const itemRows = items
    .map((item, idx) => {
      const desc = item.product_description || item.design_name_number || ""
      return `
        <p class="bold">${idx + 1}. ${escapeHtml(item.product_type)}</p>
        ${desc ? `<p class="small">${escapeHtml(desc)}</p>` : ""}
        <div class="row"><span>${item.quantity} x ${formatCurrency(orderItemUnitPrice(item))}</span><span>${formatCurrency(orderItemTotal(item))}</span></div>
      `
    })
    .join("")

  return `
    ${header}
    <div class="divider"></div>
    <div class="center bold">INVOICE</div>
    <div class="row"><span>Order #</span><span class="bold">${escapeHtml(order.order_number)}</span></div>
    <div class="row"><span>Date</span><span>${formatDate(order.order_date)}</span></div>
    <div class="divider"></div>
    <p class="bold">${escapeHtml(customer?.customer_business_name || "Walk-in Customer")}</p>
    ${customer?.contact_person ? `<p class="small">${escapeHtml(customer.contact_person)}</p>` : ""}
    ${customer?.phone ? `<p class="small">Ph: ${escapeHtml(customer.phone)}</p>` : ""}
    <div class="divider"></div>
    ${itemRows}
    <div class="divider"></div>
    <div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    ${setup > 0 ? `<div class="row"><span>${escapeHtml(extraLabel(settings))}</span><span>${formatCurrency(setup)}</span></div>` : ""}
    ${costRows}
    <div class="row bold big"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
    <div class="row"><span>Paid</span><span>${formatCurrency(paid)}</span></div>
    <div class="row bold"><span>Balance Due</span><span>${formatCurrency(balance)}</span></div>
    <div class="row"><span>Payment Status</span><span class="bold">${escapeHtml(payStatus)}</span></div>
    <div class="divider"></div>
    <div class="center small">
      <p>Thank you for your business!</p>
      <p>${formatDate(new Date())}</p>
    </div>
  `
}

async function buildOrderTagBody(order: Order, customer: Customer | null): Promise<string> {
  const header = await businessHeaderHtml()

  return `
    ${header}
    <div class="divider"></div>
    <div class="center bold">ORDER TAG</div>
    <div class="divider"></div>
    <p class="small">Order Number</p>
    <p class="bold big">${escapeHtml(order.order_number)}</p>
    <div class="divider"></div>
    <p class="small">Business Name</p>
    <p class="bold">${escapeHtml(customer?.customer_business_name || "—")}</p>
    <p class="small" style="margin-top:6px;">Contact Person</p>
    <p class="bold">${escapeHtml(customer?.contact_person || "—")}</p>
    <p class="small" style="margin-top:6px;">Phone Number</p>
    <p class="bold">${escapeHtml(customer?.phone || "—")}</p>
    <div class="divider"></div>
  `
}

// window.print() has no effect inside the app's native WebView (iOS/Android
// don't implement it there), so on native platforms we hand the user the
// same receipt, rendered as an 80mm PDF, through the OS share sheet instead
// — that's where "Print" (AirPrint, etc.) actually lives on a phone.
export async function printThermalInvoice(data: ThermalInvoiceData) {
  if (Capacitor.isNativePlatform()) {
    const blob = await generateThermalInvoicePdf(data)
    await shareFile(blob, `${data.order.order_number}.pdf`, `Invoice ${data.order.order_number}`)
    return
  }
  const body = await buildInvoiceBody(data)
  printThermalHtml(body, `Invoice ${data.order.order_number}`)
}

export async function printThermalOrderTag(order: Order, customer: Customer | null) {
  if (Capacitor.isNativePlatform()) {
    const blob = await generateThermalOrderTagPdf(order, customer)
    await shareFile(blob, `${order.order_number}-tag.pdf`, `Order Tag ${order.order_number}`)
    return
  }
  const body = await buildOrderTagBody(order, customer)
  printThermalHtml(body, `Order Tag ${order.order_number}`)
}

// Shares the same receipt PDF through the OS share sheet, where the user
// picks WhatsApp (or any other locally installed app) as the target —
// mobile OSes don't allow an app to jump straight into another app's
// share/compose UI with a file attached, the share sheet is the only
// cross-platform way to hand a file to WhatsApp with the user's consent.
export async function shareThermalInvoiceViaWhatsApp(data: ThermalInvoiceData) {
  const blob = await generateThermalInvoicePdf(data)
  await shareFile(
    blob,
    `${data.order.order_number}.pdf`,
    `Invoice ${data.order.order_number}`,
    `Order ${data.order.order_number} for ${data.customer?.customer_business_name || ""}`,
  )
}

// Returns the full receipt HTML document (for rendering inline in an
// iframe/modal) instead of sending it to the browser's print pipeline —
// used for previewing a receipt without a printer attached.
export async function getThermalInvoiceHtml(data: ThermalInvoiceData): Promise<string> {
  const body = await buildInvoiceBody(data)
  return buildThermalDocumentHtml(body, `Invoice ${data.order.order_number}`)
}

export async function getThermalOrderTagHtml(order: Order, customer: Customer | null): Promise<string> {
  const body = await buildOrderTagBody(order, customer)
  return buildThermalDocumentHtml(body, `Order Tag ${order.order_number}`)
}
