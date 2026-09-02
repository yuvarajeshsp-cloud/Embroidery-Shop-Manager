import { jsPDF } from "jspdf"
import type { Order, OrderItem, Payment, Customer } from "./types"
import {
  formatDate,
  formatNumber,
  orderItemUnitPrice,
  orderItemTotal,
  orderTotal,
  orderSetupCharges,
  orderAmountPaid,
  orderBalanceDue,
  derivePaymentStatus,
} from "./helpers"
import { fetchBusinessSettings } from "./config"

export interface OrderPdfData {
  order: Order
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
}

// jsPDF's built-in helvetica font cannot render the ₹ Unicode symbol,
// so we format currency with a "Rs." prefix for the PDF only.
function formatPdfCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))
  const sign = amount < 0 ? "-" : ""
  return `${sign}Rs. ${formatted}`
}

export async function generateOrderPdf(data: OrderPdfData): Promise<Blob> {
  const { order, customer, items, payments } = data
  const settings = await fetchBusinessSettings()

  const companyName = (settings.company_name || "Embroidery Shop Manager").trim()
  const companyTagline = (settings.company_tagline || "").trim()
  const companyEmail = (settings.company_email || "").trim()
  const companyPhone = (settings.company_phone || "").trim()
  const companyWebsite = (settings.company_website || "").trim()
  const companyAddress = (settings.company_address || "").trim()
  const companyCity = (settings.company_city || "").trim()
  const companyState = (settings.company_state || "").trim()
  const companyPincode = (settings.company_pincode || "").trim()
  const companyGst = (settings.company_gst_number || "").trim()
  const companyLogoDataUrl = (settings.company_logo_data_url || "").trim()

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2

  const navy: [number, number, number] = [23, 54, 93]
  const gold: [number, number, number] = [217, 154, 43]
  const darkText: [number, number, number] = [40, 40, 40]
  const mutedText: [number, number, number] = [110, 110, 110]
  const lightGray: [number, number, number] = [245, 245, 245]
  const borderGray: [number, number, number] = [200, 200, 200]

  // Header band
  doc.setFillColor(...navy)
  doc.rect(0, 0, pageWidth, 90, "F")

  doc.setFillColor(...gold)
  doc.rect(0, 90, pageWidth, 3, "F")

  // Logo (if configured) in left side of header
  const logoSize = 54
  const logoX = margin
  const logoY = (90 - logoSize) / 2
  const textOffsetX = companyLogoDataUrl ? logoX + logoSize + 12 : margin

  if (companyLogoDataUrl && companyLogoDataUrl.startsWith("data:image/")) {
    try {
      const logoFormat = companyLogoDataUrl.includes("image/png") ? "PNG" : "JPEG"
      doc.addImage(companyLogoDataUrl, logoFormat, logoX, logoY, logoSize, logoSize)
    } catch {
      // If logo fails to embed, continue without it
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text(companyName, textOffsetX, 38)

  if (companyTagline) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(200, 200, 200)
    doc.text(companyTagline, textOffsetX, 54)
  }

  doc.setFontSize(8)
  doc.setTextColor(220, 220, 220)
  const contactLines: string[] = []
  if (companyAddress) contactLines.push(companyAddress)
  const cityLine = [companyCity, companyState, companyPincode].filter(Boolean).join(", ")
  if (cityLine) contactLines.push(cityLine)
  if (companyPhone) contactLines.push(`Phone: ${companyPhone}`)
  if (companyEmail) contactLines.push(`Email: ${companyEmail}`)
  if (companyWebsite) contactLines.push(companyWebsite)
  if (companyGst) contactLines.push(`GST: ${companyGst}`)

  let contactY = 30
  for (const line of contactLines) {
    doc.text(line, pageWidth - margin, contactY, { align: "right" })
    contactY += 12
  }

  let y = 110

  // Document title
  doc.setTextColor(...navy)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("ORDER CONFIRMATION", margin, y)
  y += 22

  // Order meta box
  doc.setDrawColor(...borderGray)
  doc.setFillColor(...lightGray)
  doc.roundedRect(margin, y, contentWidth, 56, 4, 4, "FD")

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...mutedText)

  const metaCol1 = margin + 12
  const metaCol2 = margin + contentWidth / 2 + 12
  let metaY = y + 16

  doc.text("Order Number:", metaCol1, metaY)
  doc.text("Order Date:", metaCol2, metaY)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...darkText)
  doc.text(order.order_number, metaCol1 + 80, metaY)
  doc.text(formatDate(order.order_date), metaCol2 + 70, metaY)

  metaY += 18
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...mutedText)
  doc.text("Required Date:", metaCol1, metaY)
  doc.text("Status:", metaCol2, metaY)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...darkText)
  doc.text(formatDate(order.required_date), metaCol1 + 80, metaY)
  doc.text(order.order_status, metaCol2 + 50, metaY)

  y += 76

  // Bill To section
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...navy)
  doc.text("BILL TO", margin, y)
  y += 14

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...darkText)
  doc.text(customer?.customer_business_name || "—", margin, y)
  y += 14

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...mutedText)
  if (customer?.contact_person) { doc.text(customer.contact_person, margin, y); y += 12 }
  if (customer?.phone) { doc.text(`Phone: ${customer.phone}`, margin, y); y += 12 }
  if (customer?.email) { doc.text(`Email: ${customer.email}`, margin, y); y += 12 }
  if (customer?.billing_address) {
    const addrLines = doc.splitTextToSize(customer.billing_address, 200) as string[]
    for (const line of addrLines) { doc.text(line, margin, y); y += 12 }
  }
  if (customer?.gst_tax_number) { doc.text(`GST: ${customer.gst_tax_number}`, margin, y); y += 12 }

  y += 8

  // Items table
  const tableY = y
  const colWidths = [30, 80, 120, 50, 55, 60, 65]
  const colX = [margin]
  for (let i = 0; i < colWidths.length - 1; i++) {
    colX.push(colX[i] + colWidths[i])
  }
  const tableWidth = colWidths.reduce((a, b) => a + b, 0)

  doc.setFillColor(...navy)
  doc.rect(margin, tableY, tableWidth, 22, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  const headers = ["#", "Product", "Description", "Qty", "Stitches", "Unit Price", "Total"]
  for (let i = 0; i < headers.length; i++) {
    const align = i >= 3 ? "right" : "left"
    const x = align === "right" ? colX[i] + colWidths[i] - 6 : colX[i] + 6
    doc.text(headers[i], x, tableY + 14, { align })
  }

  y = tableY + 22

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const rowHeight = 24

    if (y + rowHeight > pageHeight - margin - 120) {
      doc.addPage()
      y = margin
    }

    if (idx % 2 === 1) {
      doc.setFillColor(...lightGray)
      doc.rect(margin, y, tableWidth, rowHeight, "F")
    }

    doc.setTextColor(...darkText)
    doc.text(String(idx + 1), colX[0] + 6, y + 15)

    const product = doc.splitTextToSize(item.product_type, colWidths[1] - 12) as string[]
    doc.text(product[0] || "", colX[1] + 6, y + 15)

    const desc = doc.splitTextToSize(item.product_description || item.design_name_number || "", colWidths[2] - 12) as string[]
    doc.text(desc[0] || "", colX[2] + 6, y + 15)

    doc.text(String(item.quantity), colX[3] + colWidths[3] - 6, y + 15, { align: "right" })
    doc.text(formatNumber(item.stitches_per_unit), colX[4] + colWidths[4] - 6, y + 15, { align: "right" })
    doc.text(formatPdfCurrency(orderItemUnitPrice(item)), colX[5] + colWidths[5] - 6, y + 15, { align: "right" })
    doc.text(formatPdfCurrency(orderItemTotal(item)), colX[6] + colWidths[6] - 6, y + 15, { align: "right" })

    y += rowHeight
  }

  doc.setDrawColor(...borderGray)
  doc.rect(margin, tableY, tableWidth, y - tableY)

  y += 12

  // Summary section
  const summaryW = 200
  const summaryX = margin + tableWidth - summaryW

  const total = orderTotal(items)
  const setup = orderSetupCharges(items)
  const subtotal = total - setup
  const paid = orderAmountPaid(payments)
  const balance = orderBalanceDue(items, payments)
  const payStatus = derivePaymentStatus(items, payments)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)

  const summaryRows: [string, string, boolean][] = [
    ["Subtotal", formatPdfCurrency(subtotal), false],
    ["Setup / Digitizing", formatPdfCurrency(setup), false],
    ["Total", formatPdfCurrency(total), true],
    ["Paid", formatPdfCurrency(paid), false],
    ["Balance Due", formatPdfCurrency(balance), true],
  ]

  for (const [label, value, bold] of summaryRows) {
    if (bold) {
      doc.setFont("helvetica", "bold")
      doc.setFillColor(...lightGray)
      doc.rect(summaryX, y - 2, summaryW, 18, "F")
    } else {
      doc.setFont("helvetica", "normal")
    }
    doc.setTextColor(...mutedText)
    doc.text(label, summaryX + 8, y + 10)
    doc.setTextColor(...darkText)
    doc.text(value, summaryX + summaryW - 8, y + 10, { align: "right" })
    y += 20
  }

  y += 8

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...navy)
  doc.text(`Payment Status: ${payStatus}`, margin, y)
  y += 16

  if (order.special_instructions) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...navy)
    doc.text("Special Instructions:", margin, y)
    y += 14
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...darkText)
    const instLines = doc.splitTextToSize(order.special_instructions, contentWidth) as string[]
    for (const line of instLines) {
      if (y > pageHeight - margin - 40) { doc.addPage(); y = margin }
      doc.text(line, margin, y)
      y += 11
    }
    y += 8
  }

  if (order.customer_po_reference) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...mutedText)
    doc.text(`PO Reference: ${order.customer_po_reference}`, margin, y)
    y += 14
  }

  // Footer
  const footerY = pageHeight - margin - 20
  doc.setDrawColor(...borderGray)
  doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(...mutedText)
  doc.text(
    `${companyName}  |  ${companyEmail || ""}  |  ${companyPhone || ""}`,
    pageWidth / 2,
    footerY,
    { align: "center" },
  )
  doc.text(
    `Generated on ${formatDate(new Date())}  |  ${order.order_number}`,
    pageWidth / 2,
    footerY + 10,
    { align: "center" },
  )

  return doc.output("blob")
}

function getPdfFileName(order: Order): string {
  return `${order.order_number}.pdf`
}

export async function downloadOrderPdf(data: OrderPdfData) {
  const blob = await generateOrderPdf(data)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = getPdfFileName(data.order)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function shareOrderPdf(data: OrderPdfData) {
  const blob = await generateOrderPdf(data)
  const fileName = getPdfFileName(data.order)

  if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: "application/pdf" })] })) {
    const file = new File([blob], fileName, { type: "application/pdf" })
    await navigator.share({
      title: `Order ${data.order.order_number}`,
      text: `Order confirmation for ${data.customer?.customer_business_name || ""}`,
      files: [file],
    })
    return
  }

  await downloadOrderPdf(data)
}
