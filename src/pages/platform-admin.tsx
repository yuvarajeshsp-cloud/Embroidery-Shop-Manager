import * as React from "react"
import { ShieldCheck, ArrowLeft } from "lucide-react"

import { supabase } from "@/lib/supabase"
import { formatDateTime, formatDate, formatCurrency, orderTotal, orderAmountPaid } from "@/lib/helpers"
import type { Organization, UserProfile, Order, Customer, OrderItem, Payment, ConfigItem } from "@/lib/types"
import { useRouter } from "@/lib/router"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface OrgRow extends Organization {
  memberCount: number
  customerCount: number
  orderCount: number
}

const statusColors: Record<string, string> = {
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  past_due: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
}

export function PlatformAdminPage() {
  const { navigate } = useRouter()
  const [rows, setRows] = React.useState<OrgRow[] | null>(null)

  React.useEffect(() => {
    loadOrgs()
  }, [])

  async function loadOrgs() {
    const { data: orgs } = await supabase.from("organizations").select("*").order("created_at", { ascending: false })
    if (!orgs) {
      setRows([])
      return
    }

    const withCounts = await Promise.all(
      orgs.map(async (org: Organization) => {
        const [{ count: memberCount }, { count: customerCount }, { count: orderCount }] = await Promise.all([
          supabase.from("user_profiles").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
          supabase.from("customers").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
          supabase.from("orders").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
        ])
        return {
          ...org,
          memberCount: memberCount || 0,
          customerCount: customerCount || 0,
          orderCount: orderCount || 0,
        }
      }),
    )
    setRows(withCounts)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader
        title="Platform Admin"
        description="Every organization on the platform — visible only to you"
      />

      <Card>
        <CardContent className="p-0">
          {rows === null ? (
            <PageLoader size="sm" />
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No organizations yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial Ends</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((org) => (
                  <TableRow
                    key={org.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ name: "platform-admin-org", id: org.id })}
                  >
                    <TableCell className="font-medium">
                      <span className="hover:underline">{org.name}</span>
                      <div className="font-mono text-xs text-muted-foreground">{org.slug}</div>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{org.plan}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[org.subscription_status] || ""}>
                        {org.subscription_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {org.trial_ends_at ? formatDateTime(org.trial_ends_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{org.memberCount}</TableCell>
                    <TableCell className="text-right">{org.customerCount}</TableCell>
                    <TableCell className="text-right">{org.orderCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(org.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          This view is read-only and only ever visible to platform admins — it doesn't grant edit access to any
          organization's data, and no organization's own users can see this page or know it exists.
        </p>
      </div>
    </div>
  )
}

const roleColors: Record<string, string> = {
  Administrator: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Operator: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Accounts: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
}

type OrgOrder = Order & { customerName?: string; total: number; paid: number }
type OrgPayment = Payment & { orderNumber?: string; customerName?: string }

export function PlatformAdminOrgPage({ id }: { id: string }) {
  const { navigate } = useRouter()
  const [org, setOrg] = React.useState<Organization | null>(null)
  const [members, setMembers] = React.useState<UserProfile[]>([])
  const [orders, setOrders] = React.useState<OrgOrder[]>([])
  const [payments, setPayments] = React.useState<OrgPayment[]>([])
  const [configItems, setConfigItems] = React.useState<ConfigItem[]>([])
  const [businessSettings, setBusinessSettings] = React.useState<{ key: string; value: string }[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadOrg()
  }, [id])

  async function loadOrg() {
    setLoading(true)
    const [orgRes, membersRes, customersRes, ordersRes, itemsRes, paymentsRes, configRes, settingsRes] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", id).maybeSingle(),
      supabase.from("user_profiles").select("*").eq("organization_id", id).order("display_name"),
      supabase.from("customers").select("id,customer_business_name").eq("organization_id", id),
      supabase.from("orders").select("*").eq("organization_id", id).order("order_date", { ascending: false }),
      supabase.from("order_items").select("*").eq("organization_id", id),
      supabase.from("payments").select("*").eq("organization_id", id).order("payment_date", { ascending: false }),
      supabase.from("config_items").select("*").eq("organization_id", id).order("category").order("sort_order"),
      supabase.from("business_settings").select("key,value").eq("organization_id", id),
    ])

    setOrg(orgRes.data)
    setMembers(membersRes.data || [])
    setConfigItems(configRes.data || [])
    setBusinessSettings(settingsRes.data || [])

    const customerMap = new Map((customersRes.data || []).map((c: { id: string; customer_business_name: string }) => [c.id, c.customer_business_name]))
    const itemsByOrder = new Map<string, OrderItem[]>()
    for (const item of itemsRes.data || []) {
      const arr = itemsByOrder.get(item.order_id) || []
      arr.push(item)
      itemsByOrder.set(item.order_id, arr)
    }
    const paymentsByOrder = new Map<string, Payment[]>()
    for (const p of paymentsRes.data || []) {
      const arr = paymentsByOrder.get(p.order_id) || []
      arr.push(p)
      paymentsByOrder.set(p.order_id, arr)
    }
    const orderMap = new Map((ordersRes.data || []).map((o: Order) => [o.id, o]))

    setOrders(
      (ordersRes.data || []).map((o: Order) => ({
        ...o,
        customerName: customerMap.get(o.customer_id),
        total: orderTotal(itemsByOrder.get(o.id) || []),
        paid: orderAmountPaid(paymentsByOrder.get(o.id) || []),
      })),
    )
    setPayments(
      (paymentsRes.data || []).map((p: Payment) => ({
        ...p,
        orderNumber: orderMap.get(p.order_id)?.order_number,
        customerName: customerMap.get(p.customer_id),
      })),
    )
    setLoading(false)
  }

  const configByCategory = React.useMemo(() => {
    const map = new Map<string, ConfigItem[]>()
    for (const item of configItems) {
      const arr = map.get(item.category) || []
      arr.push(item)
      map.set(item.category, arr)
    }
    return map
  }, [configItems])

  if (loading) return <PageLoader />
  if (!org) return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Organization not found</div>

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title={org.name} description={org.slug}>
        <Button variant="outline" size="sm" onClick={() => navigate({ name: "platform-admin" })}>
          <ArrowLeft className="size-4" /> Back to Organizations
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Plan</span>
            <span className="text-lg font-semibold capitalize">{org.plan}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge variant="outline" className={cn("w-fit", statusColors[org.subscription_status] || "")}>
              {org.subscription_status}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Trial Ends</span>
            <span className="text-sm font-medium">{org.trial_ends_at ? formatDateTime(org.trial_ends_at) : "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Created</span>
            <span className="text-sm font-medium">{formatDateTime(org.created_at)}</span>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="pt-4">
          <Card>
            <CardContent className="p-0">
              {members.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No members</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.display_name}</TableCell>
                        <TableCell className="text-sm">{m.email}</TableCell>
                        <TableCell><Badge variant="outline" className={roleColors[m.role] || ""}>{m.role}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.is_active ? "Active" : "Inactive"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="pt-4">
          <Card>
            <CardContent className="p-0">
              {orders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No orders</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                        <TableCell className="text-sm">{o.customerName || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(o.order_date)}</TableCell>
                        <TableCell><Badge variant="outline">{o.order_status}</Badge></TableCell>
                        <TableCell className="text-xs">{o.priority}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(o.total)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatCurrency(o.paid)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="pt-4">
          <Card>
            <CardContent className="p-0">
              {payments.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No payments</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment #</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.payment_number}</TableCell>
                        <TableCell className="font-mono text-xs">{p.orderNumber || "—"}</TableCell>
                        <TableCell className="text-sm">{p.customerName || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</TableCell>
                        <TableCell><Badge variant="outline">{p.payment_method}</Badge></TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(p.amount)}</TableCell>
                        <TableCell><Badge variant="outline">{p.payment_status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="pt-4">
          <div className="flex flex-col gap-4">
            <Card>
              <CardContent className="flex flex-col gap-2 p-4">
                <span className="text-sm font-medium">Business Settings</span>
                {businessSettings.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No business settings configured</p>
                ) : (
                  <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {businessSettings.map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{s.key}</span>
                        <span className="truncate font-medium">{s.value || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {configByCategory.size === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No config values</CardContent></Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...configByCategory.entries()].map(([category, items]) => (
                  <Card key={category}>
                    <CardContent className="flex flex-col gap-2 p-4">
                      <span className="text-sm font-medium capitalize">{category.replace(/_/g, " ")}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((i) => (
                          <Badge key={i.id} variant="outline" className={cn(!i.is_active && "opacity-50")}>
                            {i.name}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
