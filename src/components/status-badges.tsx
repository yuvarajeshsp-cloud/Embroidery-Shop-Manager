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
