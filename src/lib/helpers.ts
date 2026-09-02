import { supabase } from "./supabase"
import type { OrderItem, Payment } from "./types"

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value)
}

export function formatDate(date: string | Date | null): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function daysFromNow(date: string | Date | null): number {
  if (!date) return 0
  const d = typeof date === "string" ? new Date(date) : date
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function isOverdue(date: string | Date | null): boolean {
  if (!date) return false
  return daysFromNow(date) < 0
}

export function isDueSoon(date: string | Date | null, threshold = 3): boolean {
  const days = daysFromNow(date)
  return days >= 0 && days <= threshold
}

export function orderItemUnitPrice(item: OrderItem): number {
  if (item.manual_unit_price !== null && item.manual_unit_price !== undefined) {
    return item.manual_unit_price
  }
  const stitchPrice =
    (item.stitches_per_unit / 1000) * item.rate_per_1000_stitches
  return Math.round(stitchPrice * 100) / 100
}

export function orderItemTotal(item: OrderItem): number {
  return Math.round(orderItemUnitPrice(item) * item.quantity * 100) / 100
}

export function orderSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + orderItemTotal(item), 0)
}

export function orderSetupCharges(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + (item.setup_digitizing_charge || 0), 0)
}

export function orderTotal(items: OrderItem[]): number {
  return Math.round((orderSubtotal(items) + orderSetupCharges(items)) * 100) / 100
}

export function orderAmountPaid(payments: Payment[]): number {
  return payments
    .filter((p) => p.payment_status === "Completed")
    .reduce((sum, p) => sum + p.amount, 0)
}

export function orderBalanceDue(items: OrderItem[], payments: Payment[]): number {
  return Math.round((orderTotal(items) - orderAmountPaid(payments)) * 100) / 100
}

export function derivePaymentStatus(
  items: OrderItem[],
  payments: Payment[],
): string {
  const total = orderTotal(items)
  const paid = orderAmountPaid(payments)
  if (paid <= 0) return "Unpaid"
  if (paid >= total) return "Paid"
  return "Part Paid"
}

export async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `ORD-${year}-`

  const { data, error } = await supabase
    .from("orders")
    .select("order_number")
    .ilike("order_number", `${prefix}%`)
    .order("order_number", { ascending: false })
    .limit(1)

  let next = 1
  if (!error && data && data.length > 0) {
    const lastSeq = parseInt(data[0].order_number.slice(prefix.length), 10)
    if (!isNaN(lastSeq)) next = lastSeq + 1
  }

  return `${prefix}${String(next).padStart(4, "0")}`
}

export function generatePaymentNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(1000 + Math.random() * 9000)
  return `PAY-${year}-${random}`
}

export async function generateCustomerCode(): Promise<string> {
  const prefix = "CUST-"

  const { data, error } = await supabase
    .from("customers")
    .select("customer_code")
    .ilike("customer_code", `${prefix}%`)
    .order("customer_code", { ascending: false })
    .limit(1)

  let next = 1001
  if (!error && data && data.length > 0) {
    const lastSeq = parseInt(data[0].customer_code.slice(prefix.length), 10)
    if (!isNaN(lastSeq)) next = lastSeq + 1
  }

  return `${prefix}${String(next).padStart(4, "0")}`
}

export function generateTaskNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(1000 + Math.random() * 9000)
  return `PRD-${year}-${random}`
}

