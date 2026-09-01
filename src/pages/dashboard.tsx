import * as React from "react"
import { Link2, TrendingUp, AlertTriangle, Clock, Package, IndianRupee } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { formatCurrency, formatDate, isOverdue, isDueSoon, orderAmountPaid, orderBalanceDue } from "@/lib/helpers"
import type { Order, OrderItem, Payment, Customer, ProductionRecord } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { OrderStatusBadge, PriorityBadge } from "@/components/status-badges"
import { useRouter } from "@/lib/router"
import { BarChart, Bar, XAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

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
  monthlyData: { month: string; orders: number; revenue: number }[]
  statusBreakdown: { status: string; count: number }[]
}

export function DashboardPage() {
  const { navigate } = useRouter()
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      const [ordersRes, customersRes, itemsRes, paymentsRes, productionRes] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("*"),
        supabase.from("order_items").select("*"),
        supabase.from("payments").select("*").eq("payment_status", "Completed"),
        supabase.from("production_records").select("*").eq("is_active", true),
      ])

      const orders = (ordersRes.data || []) as Order[]
      const customers = (customersRes.data || []) as Customer[]
      const items = (itemsRes.data || []) as OrderItem[]
      const payments = (paymentsRes.data || []) as Payment[]

      const customerMap = new Map(customers.map((c) => [c.id, c]))
      const itemsByOrder = new Map<string, OrderItem[]>()
      for (const item of items) {
        const arr = itemsByOrder.get(item.order_id) || []
        arr.push(item)
        itemsByOrder.set(item.order_id, arr)
      }
      const paymentsByOrder = new Map<string, Payment[]>()
      for (const p of payments) {
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
      const inProduction = (productionRes.data || []).filter(
        (p: ProductionRecord) => p.overall_stage !== "Delivered" && p.overall_stage !== "Not Scheduled",
      )

      const recentOrders = orders.slice(0, 5).map((o) => ({
        ...o,
        customer: customerMap.get(o.customer_id),
      }))

      const urgentOrders = activeOrders
        .filter((o) => o.priority === "Urgent" || o.priority === "High")
        .slice(0, 5)
        .map((o) => ({ ...o, customer: customerMap.get(o.customer_id) }))

      // Monthly data for last 6 months
      const now = new Date()
      const monthlyData: { month: string; orders: number; revenue: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthName = d.toLocaleString("en-IN", { month: "short" })
        const monthOrders = orders.filter((o) => {
          const od = new Date(o.order_date)
          return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth()
        })
        let monthRevenue = 0
        for (const o of monthOrders) {
          const pays = paymentsByOrder.get(o.id) || []
          monthRevenue += orderAmountPaid(pays)
        }
        monthlyData.push({ month: monthName, orders: monthOrders.length, revenue: monthRevenue })
      }

      // Status breakdown
      const statusCounts: Record<string, number> = {}
      for (const o of orders) {
        statusCounts[o.order_status] = (statusCounts[o.order_status] || 0) + 1
      }
      const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({ status, count }))

      setData({
        totalOrders: orders.length,
        activeOrders: activeOrders.length,
        totalRevenue,
        pendingPayments,
        overdueOrders: overdueOrders.length,
        dueSoonOrders: dueSoonOrders.length,
        inProduction: inProduction.length,
        recentOrders,
        urgentOrders,
        monthlyData,
        statusBreakdown,
      })
    } catch (err) {
      console.error("Dashboard load error:", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
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
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Dashboard" description="Overview of your embroidery business">
        <Button onClick={() => navigate({ name: "order-new" })} size="sm">
          <Plus className="size-4" />
          New Order
        </Button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label}>
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
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Trends</CardTitle>
            <CardDescription>Orders and revenue over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={data.monthlyData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="orders" fill="var(--color-orders)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent>
            {data.statusBreakdown.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
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
      <div className="grid gap-4 lg:grid-cols-2">
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
