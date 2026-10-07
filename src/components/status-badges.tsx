import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusClasses: Record<string, string> = {
  Design: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Quotation: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Confirmed: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  "In Production": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Ready: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  "On Hold": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  Cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
}

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", statusClasses[status] || "")}>
      {status}
    </Badge>
  )
}

const priorityClasses: Record<string, string> = {
  Urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", priorityClasses[priority] || "")}>
      {priority}
    </Badge>
  )
}

const paymentStatusClasses: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  "Part Paid": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  Unpaid: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Refunded: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", paymentStatusClasses[status] || "")}>
      {status}
    </Badge>
  )
}

const stageStatusClasses: Record<string, string> = {
  "Not Started": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  "In Progress": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Waiting: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  Completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  "Not Required": "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-600",
}

export function StageStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", stageStatusClasses[status] || "")}>
      {status}
    </Badge>
  )
}

// Customer types and payment methods are lists each shop edits itself, so the
// common names get fixed colours and any name added later falls back to a
// colour picked from its text — always the same colour for the same name.
const FALLBACK_COLORS = [
  "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
]

function colorFor(name: string, known: Record<string, string>): string {
  const match = Object.keys(known).find((k) => k.toLowerCase() === name.trim().toLowerCase())
  if (match) return known[match]
  let hash = 0
  for (const ch of name.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

const customerTypeClasses: Record<string, string> = {
  Retail: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Wholesale: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Reseller: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "Direct Customer": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  "Designer/Boutique": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "School/College": "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  Dealer: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Corporate: "bg-slate-200 text-slate-800 dark:bg-slate-700/40 dark:text-slate-200",
}

export function CustomerTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", colorFor(type, customerTypeClasses))}>
      {type}
    </Badge>
  )
}

const paymentMethodClasses: Record<string, string> = {
  Cash: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  UPI: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  Credit: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Card: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  "Bank Transfer": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Cheque: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  Other: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
}

export function PaymentMethodBadge({ method }: { method: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", colorFor(method, paymentMethodClasses))}>
      {method}
    </Badge>
  )
}
