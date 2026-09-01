import type {
  OrderItem,
  Payment,
  ProductionRecord,
  ProductionStageHistory,
} from "./types"

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

export function generateOrderNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(1000 + Math.random() * 9000)
  return `ORD-${year}-${random}`
}

export function generatePaymentNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(1000 + Math.random() * 9000)
  return `PAY-${year}-${random}`
}

export function generateCustomerCode(name: string): string {
  const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X")
  const random = Math.floor(100 + Math.random() * 900)
  return `${prefix}${random}`
}

export function generateTaskNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(1000 + Math.random() * 9000)
  return `PRD-${year}-${random}`
}

export function productionStages(): string[] {
  return [
    "Not Scheduled",
    "Digitizing",
    "Confirmation",
    "Production",
    "Quality Check",
    "Ready for Delivery",
    "Delivered",
  ]
}

export function stageFields(): { key: string; label: string; dateKey: string | null }[] {
  return [
    { key: "digitizing_status", label: "Digitizing", dateKey: "digitizing_date" },
    { key: "sampling_status", label: "Sampling", dateKey: "sample_approval_date" },
    { key: "production_status", label: "Production", dateKey: "production_start_date" },
    { key: "qc_status", label: "Quality Check", dateKey: null },
    { key: "packing_status", label: "Packing", dateKey: null },
    { key: "delivery_status", label: "Delivery", dateKey: null },
  ]
}

export function stageToOverallStage(record: ProductionRecord): string {
  const stages = stageFields()
  for (const stage of stages) {
    const status = record[stage.key as keyof ProductionRecord] as string
    if (
      status === "In Progress" ||
      status === "Waiting" ||
      (status === "Not Started" && stage.key === "digitizing_status")
    ) {
      if (status === "In Progress") return stage.label
      if (status === "Waiting") return stage.label
    }
  }
  if (record.delivery_status === "Completed") return "Delivered"
  if (record.packing_status === "Completed") return "Ready for Delivery"
  if (record.qc_status === "Completed") return "Quality Check"
  if (record.production_status === "Completed") return "Quality Check"
  if (record.production_status === "In Progress") return "Production"
  if (record.sampling_status === "In Progress") return "Confirmation"
  if (record.sampling_status === "Completed") return "Production"
  if (record.digitizing_status === "In Progress") return "Digitizing"
  if (record.digitizing_status === "Completed") return "Confirmation"
  return "Not Scheduled"
}

export function summarizeStageHistory(
  history: ProductionStageHistory[],
): { field: string; previous: string; newValue: string; changedAt: string; reason: string | null }[] {
  return history
    .slice()
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
    .map((h) => ({
      field: h.field_name,
      previous: h.previous_value || "—",
      newValue: h.new_value || "—",
      changedAt: h.changed_at,
      reason: h.reason,
    }))
}
