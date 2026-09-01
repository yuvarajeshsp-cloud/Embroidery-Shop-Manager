import * as React from "react"
import { TrendingUp, IndianRupee, Package, Users } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  formatCurrency,
  formatDate,
  orderTotal,
  orderAmountPaid,
  orderBalanceDue,
} from "@/lib/helpers"
import type { Order, Customer, OrderItem, Payment } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { OrderStatusBadge } from "@/components/status-badges"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "@/lib/router"

export function ReportsPage() {
  const { navigate } = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [orders, setOrders] = React.useState<(Order & { customer?: Customer; order_items?: OrderItem[]; payments?: Payment[] })[]>([])
  const [customers, setCustomers] = React.useState<Customer[]>([])

  React.useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [ordersRes, customersRes, itemsRes, paymentsRes] = await Promise.all([
      supabase.from("orders").select("*").order("order_date", { ascending: false }),
      supabase.from("customers").select("*"),
      supabase.from("order_items").select("*"),
      supabase.from("payments").select("*").eq("payment_status", "Completed"),
    ])

    const allOrders = ordersRes.data || []
    const allCustomers = customersRes.data || []
    const allItems = itemsRes.data || []
    const allPayments = paymentsRes.data || []

    const customerMap = new Map(allCustomers.map((c: Customer) => [c.id, c]))
    const itemsByOrder = new Map<string, OrderItem[]>()
    for (const item of allItems) {
      const arr = itemsByOrder.get(item.order_id) || []
      arr.push(item)
      itemsByOrder.set(item.order_id, arr)
    }
    const paymentsByOrder = new Map<string, Payment[]>()
    for (const p of allPayments) {
      const arr = paymentsByOrder.get(p.order_id) || []
      arr.push(p)
      paymentsByOrder.set(p.order_id, arr)
    }

    setOrders(
      allOrders.map((o: Order) => ({
        ...o,
        customer: customerMap.get(o.customer_id),
        order_items: itemsByOrder.get(o.id) || [],
        payments: paymentsByOrder.get(o.id) || [],
      })),
    )
    setCustomers(allCustomers)
    setLoading(false)
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Loading reports...</div>
  }

  // Revenue by month
  const now = new Date()
  const monthlyRevenue: { month: string; revenue: number; orders: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthName = d.toLocaleString("en-IN", { month: "short", year: "2-digit" })
    const monthOrders = orders.filter((o) => {
      const od = new Date(o.order_date)
      return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth()
    })
    const rev = monthOrders.reduce((s, o) => s + orderAmountPaid(o.payments || []), 0)
    monthlyRevenue.push({ month: monthName, revenue: rev, orders: monthOrders.length })
  }

  // Status breakdown
  const statusCounts: Record<string, number> = {}
  for (const o of orders) {
    statusCounts[o.order_status] = (statusCounts[o.order_status] || 0) + 1
  }
  const statusData = Object.entries(statusCounts).map(([status, count]) => ({ status, count }))

  // Top customers by order value
  const customerTotals: Record<string, { customer?: Customer; total: number; count: number }> = {}
  for (const o of orders) {
    const key = o.customer_id
    if (!customerTotals[key]) customerTotals[key] = { customer: o.customer, total: 0, count: 0 }
    customerTotals[key].total += orderTotal(o.order_items || [])
    customerTotals[key].count += 1
  }
  const topCustomers = Object.values(customerTotals)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  // Outstanding balances
  const outstanding = orders
    .filter((o) => o.order_status !== "Cancelled" && o.order_status !== "Delivered")
    .map((o) => ({
      ...o,
      balance: orderBalanceDue(o.order_items || [], o.payments || []),
    }))
    .filter((o) => o.balance > 0)
    .sort((a, b) => b.balance - a.balance)

  const totalOutstanding = outstanding.reduce((s, o) => s + o.balance, 0)
  const totalRevenue = orders.reduce((s, o) => s + orderAmountPaid(o.payments || []), 0)
  const totalOrderValue = orders.reduce((s, o) => s + orderTotal(o.order_items || []), 0)

  const chartConfig = {
    revenue: { label: "Revenue", color: "var(--chart-1)" },
    orders: { label: "Orders", color: "var(--chart-2)" },
  }
  const pieColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Reports" description="Business analytics and insights" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Revenue</span>
              <IndianRupee className="size-4 text-emerald-600" />
            </div>
            <span className="text-xl font-bold">{formatCurrency(totalRevenue)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Order Value</span>
              <Package className="size-4 text-blue-600" />
            </div>
            <span className="text-xl font-bold">{formatCurrency(totalOrderValue)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Outstanding</span>
              <TrendingUp className="size-4 text-amber-600" />
            </div>
            <span className="text-xl font-bold text-amber-600">{formatCurrency(totalOutstanding)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Customers</span>
              <Users className="size-4 text-purple-600" />
            </div>
            <span className="text-xl font-bold">{customers.length}</span>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
        </TabsList>

        {/* Revenue tab */}
        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Revenue (Last 12 Months)</CardTitle>
              <CardDescription>Collected payments by month</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[320px] w-full">
                <LineChart data={monthlyRevenue}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orders tab */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Orders by Status</CardTitle>
              <CardDescription>Distribution of order statuses</CardDescription>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[320px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie data={statusData} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={100} label={(entry: { name?: string }) => entry.name ?? ""}>
                      {statusData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Monthly Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={monthlyRevenue}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--color-orders)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers tab */}
        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Customers by Order Value</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {topCustomers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topCustomers.map((c, i) => (
                      <TableRow
                        key={i}
                        className="cursor-pointer"
                        onClick={() => c.customer && navigate({ name: "customer-detail", id: c.customer.id })}
                      >
                        <TableCell className="font-medium">{i + 1}</TableCell>
                        <TableCell>{c.customer?.customer_business_name || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{c.customer?.customer_type || "—"}</Badge></TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(c.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Outstanding tab */}
        <TabsContent value="outstanding">
          <Card>
            <CardHeader>
              <CardTitle>Outstanding Balances</CardTitle>
              <CardDescription>Orders with unpaid balances — Total: {formatCurrency(totalOutstanding)}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {outstanding.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No outstanding balances</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstanding.map((o) => (
                      <TableRow
                        key={o.id}
                        className="cursor-pointer"
                        onClick={() => navigate({ name: "order-detail", id: o.id })}
                      >
                        <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                        <TableCell>{o.customer?.customer_business_name || "—"}</TableCell>
                        <TableCell className="text-sm">{formatDate(o.required_date)}</TableCell>
                        <TableCell><OrderStatusBadge status={o.order_status} /></TableCell>
                        <TableCell className="text-right font-medium text-amber-600">{formatCurrency(o.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
