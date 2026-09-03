import { fetchBusinessSettings } from "./config"
import {
  formatCurrency,
  formatDate,
  orderItemUnitPrice,
  orderItemTotal,
  orderTotal,
  orderSetupCharges,
  orderAmountPaid,
  orderBalanceDue,
  derivePaymentStatus,
} from "./helpers"
import type { Order, OrderItem, Payment, Customer } from "./types"

export interface ThermalInvoiceData {
  order: Order
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
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

async function businessHeaderHtml(): Promise<string> {
  const settings = await fetchBusinessSettings()
  const name = (settings.company_name || "Embroidery Shop Manager").trim()
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

  const subtotal = orderTotal(items) - orderSetupCharges(items)
  const setup = orderSetupCharges(items)
  const total = orderTotal(items)
  const paid = orderAmountPaid(payments)
  const balance = orderBalanceDue(items, payments)
  const payStatus = derivePaymentStatus(items, payments)

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
    ${setup > 0 ? `<div class="row"><span>Setup/Digitizing</span><span>${formatCurrency(setup)}</span></div>` : ""}
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

export async function printThermalInvoice(data: ThermalInvoiceData) {
  const body = await buildInvoiceBody(data)
  printThermalHtml(body, `Invoice ${data.order.order_number}`)
}

export async function printThermalOrderTag(order: Order, customer: Customer | null) {
  const body = await buildOrderTagBody(order, customer)
  printThermalHtml(body, `Order Tag ${order.order_number}`)
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
