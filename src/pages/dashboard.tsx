import * as React from "react"
import { Link2, TrendingUp, AlertTriangle, Clock, Package, IndianRupee } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, isOverdue, isDueSoon, orderAmountPaid, orderBalanceDue } from "@/lib/helpers"
import type { Order, OrderItem, Payment, Customer } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { OrderStatusBadge, PriorityBadge } from "@/components/status-badges"
import { useRouter } from "@/lib/router"
import { BarChart, Bar, XAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { DateRangeFilter } from "@/components/date-range-filter"
import { computeDateRange, isWithinRange, type DateRangePreset } from "@/lib/date-range"
import {
  differenceInCalendarDays,
  startOfDay,
  endOfWeek,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subMonths,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  format,
} from "date-fns"

type TrendGranularity = "day" | "week" | "month" | "year"

// Each preset has an expected shape for its trend chart — a full 7-day week
// even before the week is over, weekly bars across a month, three full
// calendar months for "Last 3 Months", etc. — rather than a generic
// span-based guess. Presets not listed here (custom range, all time) fall
// back to picking granularity from how wide the resolved range actually is.
const TREND_PRESET_CONFIG: Partial<Record<DateRangePreset, {
  granularity: TrendGranularity
  range?: (now: Date) => { from: Date; to: Date }
}>> = {
  today: { granularity: "day" },
  this_week: {
    granularity: "day",
    range: (now) => ({ from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) }),
  },
  last_week: { granularity: "day" },
  this_month: { granularity: "week" },
  last_month: { granularity: "week" },
  last_3_months: {
    granularity: "month",
    range: (now) => ({ from: startOfMonth(subMonths(now, 3)), to: endOfMonth(subMonths(now, 1)) }),
  },
  this_year: { granularity: "month" },
}

function pickTrendGranularity(from: Date, to: Date): TrendGranularity {
  const spanDays = differenceInCalendarDays(to, from) + 1
  if (spanDays <= 31) return "day"
  if (spanDays <= 120) return "week"
  if (spanDays <= 900) return "month"
  return "year"
}

function bucketStart(date: Date, granularity: TrendGranularity): Date {
  switch (granularity) {
    case "day": return startOfDay(date)
    case "week": return startOfWeek(date, { weekStartsOn: 1 })
    case "month": return startOfMonth(date)
    case "year": return startOfYear(date)
  }
}

function bucketLabel(date: Date, granularity: TrendGranularity): string {
  switch (granularity) {
    case "day": return format(date, "d MMM")
    case "week": return format(date, "d MMM")
    case "month": return format(date, "MMM yyyy")
    case "year": return format(date, "yyyy")
  }
}

const GRANULARITY_DESCRIPTION: Record<TrendGranularity, string> = {
  day: "Orders and revenue by day",
  week: "Orders and revenue by week",
  month: "Orders and revenue by month",
  year: "Orders and revenue by year",
}

interface DashboardData {
  totalOrders: number
  activeOrders: number
  totalRevenue: number
  pendingPayments: number
  overdueOrders: number
  dueSoonOrders: number
  inProduction: number
  recentOrders: (Order & { customer?: Customer })[]
  urgentOrders: (Order & { customer?: Customer })[]
  trendData: { label: string; orders: number; revenue: number }[]
  trendDescription: string
  statusBreakdown: { status: string; count: number }[]
}

export function DashboardPage() {
  const { navigate } = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [rawOrders, setRawOrders] = React.useState<Order[]>([])
  const [rawCustomers, setRawCustomers] = React.useState<Customer[]>([])
  const [rawItems, setRawItems] = React.useState<OrderItem[]>([])
  const [rawPayments, setRawPayments] = React.useState<Payment[]>([])
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>("this_week")
  const [customFrom, setCustomFrom] = React.useState("")
  const [customTo, setCustomTo] = React.useState("")

  React.useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      const [ordersRes, customersRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("*"),
        supabase.from("order_items").select("*"),
        supabase.from("payments").select("*").eq("payment_status", "Completed"),
      ])

      const firstError = ordersRes.error || customersRes.error || itemsRes.error || paymentsRes.error
      if (firstError) throw firstError

      setRawOrders((ordersRes.data || []) as Order[])
      setRawCustomers((customersRes.data || []) as Customer[])
      setRawItems((itemsRes.data || []) as OrderItem[])
      setRawPayments((paymentsRes.data || []) as Payment[])
    } catch (err) {
      console.error("Dashboard load error:", err)
      toast.error(err instanceof Error ? err.message : "Failed to load dashboard data")
    } finally {
      setLoading(false)
    }
  }

  const data = React.useMemo<DashboardData>(() => {
      const dateRange = computeDateRange(datePreset, customFrom, customTo)
      const orders = rawOrders.filter((o) => isWithinRange(o.order_date, dateRange))

      const customerMap = new Map(rawCustomers.map((c) => [c.id, c]))
      const itemsByOrder = new Map<string, OrderItem[]>()
      for (const item of rawItems) {
        const arr = itemsByOrder.get(item.order_id) || []
        arr.push(item)
        itemsByOrder.set(item.order_id, arr)
      }
      const paymentsByOrder = new Map<string, Payment[]>()
      for (const p of rawPayments) {
        const arr = paymentsByOrder.get(p.order_id) || []
        arr.push(p)
        paymentsByOrder.set(p.order_id, arr)
      }

      const activeStatuses = ["Design", "Quotation", "Confirmed", "In Production", "Ready", "On Hold"]
      const activeOrders = orders.filter((o) => activeStatuses.includes(o.order_status))

      let totalRevenue = 0
      let pendingPayments = 0
      for (const order of orders) {
        const oi = itemsByOrder.get(order.id) || []
        const pays = paymentsByOrder.get(order.id) || []
        const paid = orderAmountPaid(pays)
        const balance = orderBalanceDue(oi, pays)
        totalRevenue += paid
        if (balance > 0 && !["Cancelled", "Delivered"].includes(order.order_status)) {
          pendingPayments += balance
        }
      }

      const overdueOrders = activeOrders.filter((o) => isOverdue(o.required_date))
      const dueSoonOrders = activeOrders.filter((o) => isDueSoon(o.required_date) && !isOverdue(o.required_date))
      const inProduction = orders.filter((o) => o.order_status === "In Production")

      const recentOrders = orders.slice(0, 5).map((o) => ({
        ...o,
        customer: customerMap.get(o.customer_id),
      }))

      const urgentOrders = activeOrders
        .filter((o) => o.priority === "Urgent" || o.priority === "High")
        .slice(0, 5)
        .map((o) => ({ ...o, customer: customerMap.get(o.customer_id) }))

      // Trend chart: bucket the filtered orders across a range and granularity
      // that matches what the selected preset should look like — a full 7-day
      // week, weekly bars across a month, 3 full months for "Last 3 Months",
      // etc. (see TREND_PRESET_CONFIG). Presets without a fixed shape (custom
      // range) fall back to a span-based guess. "All Time" has no natural
      // upper-bound start, so it's bucketed against the actual earliest order
      // instead of an empty multi-decade range, and shows nothing until there
      // is at least one order.
      const now = new Date()
      const presetConfig = TREND_PRESET_CONFIG[datePreset]
      let trendFrom = dateRange.from
      let trendTo = dateRange.to
      let showSkeleton = true
      if (presetConfig?.range) {
        ;({ from: trendFrom, to: trendTo } = presetConfig.range(now))
      } else if (datePreset === "all_time") {
        showSkeleton = orders.length > 0
        if (showSkeleton) {
          trendFrom = orders.reduce(
            (min, o) => (new Date(o.order_date) < min ? new Date(o.order_date) : min),
            new Date(orders[0].order_date),
          )
        }
      }
      const granularity = presetConfig?.granularity ?? pickTrendGranularity(trendFrom, trendTo)
      const bucketRanges: Record<TrendGranularity, (interval: { start: Date; end: Date }) => Date[]> = {
        day: eachDayOfInterval,
        week: (interval) => eachWeekOfInterval(interval, { weekStartsOn: 1 }),
        month: eachMonthOfInterval,
        year: eachYearOfInterval,
      }
      const bucketStarts = showSkeleton && trendFrom <= trendTo
        ? bucketRanges[granularity]({ start: trendFrom, end: trendTo })
        : []

      const trendBuckets = new Map<string, { label: string; orders: number; revenue: number }>()
      for (const start of bucketStarts) {
        const key = start.toISOString()
        trendBuckets.set(key, { label: bucketLabel(start, granularity), orders: 0, revenue: 0 })
      }
      for (const o of orders) {
        const key = bucketStart(new Date(o.order_date), granularity).toISOString()
        const bucket = trendBuckets.get(key)
        if (!bucket) continue
        bucket.orders += 1
        bucket.revenue += orderAmountPaid(paymentsByOrder.get(o.id) || [])
      }
      const trendData = [...trendBuckets.values()]
      const trendDescription = GRANULARITY_DESCRIPTION[granularity]

      // Status breakdown
      const statusCounts: Record<string, number> = {}
      for (const o of orders) {
        statusCounts[o.order_status] = (statusCounts[o.order_status] || 0) + 1
      }
      const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({ status, count }))

      return {
        totalOrders: orders.length,
        activeOrders: activeOrders.length,
        totalRevenue,
        pendingPayments,
        overdueOrders: overdueOrders.length,
        dueSoonOrders: dueSoonOrders.length,
        inProduction: inProduction.length,
        recentOrders,
        urgentOrders,
        trendData,
        trendDescription,
        statusBreakdown,
      }
  }, [rawOrders, rawCustomers, rawItems, rawPayments, datePreset, customFrom, customTo])

  if (loading) {
    return <PageLoader label="Loading dashboard..." />
  }

  const kpis = [
    { label: "Total Orders", value: data.totalOrders.toString(), icon: Package, color: "text-blue-600" },
    { label: "Active Orders", value: data.activeOrders.toString(), icon: TrendingUp, color: "text-emerald-600" },
    { label: "Revenue (Collected)", value: formatCurrency(data.totalRevenue), icon: IndianRupee, color: "text-teal-600" },
    { label: "Pending Payments", value: formatCurrency(data.pendingPayments), icon: AlertTriangle, color: "text-amber-600" },
    { label: "Overdue Orders", value: data.overdueOrders.toString(), icon: Clock, color: "text-red-600" },
    { label: "In Production", value: data.inProduction.toString(), icon: Link2, color: "text-purple-600" },
  ]

  const chartConfig = {
    orders: { label: "Orders", color: "var(--chart-1)" },
    revenue: { label: "Revenue", color: "var(--chart-2)" },
  }

  const pieColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Dashboard" description="Overview of your embroidery business">
        <Button onClick={() => navigate({ name: "order-new" })} size="sm">
          <Plus className="size-4" />
          New Order
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <DateRangeFilter
          preset={datePreset}
          onPresetChange={setDatePreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid min-w-0 grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label} className="min-w-0">
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  <Icon className={`size-4 ${kpi.color}`} />
                </div>
                <span className="text-xl font-bold tracking-tight">{kpi.value}</span>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Trends</CardTitle>
            <CardDescription>{data.trendDescription}</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {data.trendData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[280px] w-full min-w-0">
                <BarChart data={data.trendData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--color-orders)" radius={4} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No orders yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {data.statusBreakdown.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[280px] w-full min-w-0">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={data.statusBreakdown}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry: { name?: string }) => entry.name ?? ""}
                  >
                    {data.statusBreakdown.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No orders yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent + Urgent Orders */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest 5 orders</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No orders yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.recentOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => navigate({ name: "order-detail", id: order.id })}
                    className="flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{order.order_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {order.customer?.customer_business_name || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDate(order.order_date)}</span>
                      <OrderStatusBadge status={order.order_status} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Priority Orders</CardTitle>
            <CardDescription>Urgent and high priority orders</CardDescription>
          </CardHeader>
          <CardContent>
            {data.urgentOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No urgent orders</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.urgentOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => navigate({ name: "order-detail", id: order.id })}
                    className="flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{order.order_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {order.customer?.customer_business_name || "—"} · Due {formatDate(order.required_date)}
                      </span>
                    </div>
                    <PriorityBadge priority={order.priority} />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
