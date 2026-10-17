import * as React from "react"
import { ShieldCheck, ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { notify } from "@/lib/notify"

import { supabase } from "@/lib/supabase"
import { formatDateTime, formatDate, formatCurrency, orderTotal, orderAmountPaid } from "@/lib/helpers"
import type { Organization, UserProfile, Order, OrderItem, Payment, ConfigItem, PlatformSettings, OrganizationAccessLevel } from "@/lib/types"
import { fetchPlatformSettings, formatRupees } from "@/lib/subscription"
import { useRouter } from "@/lib/router"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  comped: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
}

const accessLevelColors: Record<OrganizationAccessLevel, string> = {
  full: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  view_only: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  locked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
}

/**
 * Client-side mirror of the organization_access_level() SQL function, for
 * *display* only on this page. It can't just call that RPC per-org: the
 * function short-circuits to 'full' for any org at all when the caller is a
 * platform admin (that's the point — platform admins bypass the paywall
 * everywhere), which would make every row here misleadingly show "full".
 */
function computeAccessLevel(org: Organization): OrganizationAccessLevel {
  const fullAccessUntil = Math.max(
    org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : -Infinity,
    org.subscription_current_period_end ? new Date(org.subscription_current_period_end).getTime() : -Infinity,
    org.comp_access_until ? new Date(org.comp_access_until).getTime() : -Infinity,
  )
  const now = Date.now()
  if (fullAccessUntil > now) return "full"
  const threeMonthsMs = 3 * 30 * 24 * 60 * 60 * 1000
  if (fullAccessUntil + threeMonthsMs > now) return "view_only"
  return "locked"
}

function PricingCard() {
  const [settings, setSettings] = React.useState<PlatformSettings | null>(null)
  const [price, setPrice] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    void fetchPlatformSettings().then((s) => {
      setSettings(s)
      if (s) setPrice(String(s.monthly_price_paise / 100))
    })
  }, [])

  async function handleSave() {
    const rupees = Number(price)
    if (!Number.isFinite(rupees) || rupees <= 0) {
      toast.error("Enter a valid monthly price")
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from("platform_settings")
      .update({ monthly_price_paise: Math.round(rupees * 100) })
      .eq("id", true)
    setSaving(false)
    if (error) {
      toast.error("Failed to save price")
      return
    }
    notify.success("Monthly price updated")
    void fetchPlatformSettings().then(setSettings)
  }

  if (!settings) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription Pricing</CardTitle>
        <CardDescription>
          Applies to new subscriptions going forward — {formatRupees(settings.monthly_price_paise * 10)}/year (2 months free)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="monthly-price">Monthly price (₹)</Label>
          <Input id="monthly-price" type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} className="w-32" />
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  )
}

export function PlatformAdminPage() {
  const { navigate } = useRouter()
  const [rows, setRows] = React.useState<OrgRow[] | null>(null)

  React.useEffect(() => {
    loadOrgs()
  }, [])

  async function loadOrgs() {
    const { data } = await supabase.rpc("pa_organizations")
    const orgs = (data || []) as Organization[]
    if (orgs.length === 0) {
      setRows([])
      return
    }

    const withCounts = await Promise.all(
      orgs.map(async (org) => {
        const { data: counts } = await supabase.rpc("pa_org_counts", { p_org_id: org.id }).maybeSingle()
        const c = counts as { member_count: number; customer_count: number; order_count: number } | null
        return {
          ...org,
          memberCount: c?.member_count ?? 0,
          customerCount: c?.customer_count ?? 0,
          orderCount: c?.order_count ?? 0,
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

      <PricingCard />

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
                  <TableHead>Access</TableHead>
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
                    <TableCell>
                      <Badge variant="outline" className={accessLevelColors[computeAccessLevel(org)]}>
                        {computeAccessLevel(org).replace("_", " ")}
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
      supabase.rpc("pa_organization", { p_org_id: id }).maybeSingle(),
      supabase.rpc("pa_members", { p_org_id: id }),
      supabase.rpc("pa_customer_names", { p_org_id: id }),
      supabase.rpc("pa_orders", { p_org_id: id }),
      supabase.rpc("pa_order_items", { p_org_id: id }),
      supabase.rpc("pa_payments", { p_org_id: id }),
      supabase.rpc("pa_config_items", { p_org_id: id }),
      supabase.rpc("pa_business_settings", { p_org_id: id }),
    ])

    const org = (orgRes.data || null) as Organization | null
    const members = (membersRes.data || []) as UserProfile[]
    const customers = (customersRes.data || []) as { id: string; customer_business_name: string }[]
    const orders = (ordersRes.data || []) as Order[]
    const items = (itemsRes.data || []) as OrderItem[]
    const paymentsData = (paymentsRes.data || []) as Payment[]
    const configItemsData = (configRes.data || []) as ConfigItem[]
    const settingsData = (settingsRes.data || []) as { key: string; value: string }[]

    setOrg(org)
    setMembers([...members].sort((a, b) => a.display_name.localeCompare(b.display_name)))
    setConfigItems(configItemsData)
    setBusinessSettings(settingsData)

    const customerMap = new Map(customers.map((c) => [c.id, c.customer_business_name]))
    const itemsByOrder = new Map<string, OrderItem[]>()
    for (const item of items) {
      const arr = itemsByOrder.get(item.order_id) || []
      arr.push(item)
      itemsByOrder.set(item.order_id, arr)
    }
    const paymentsByOrder = new Map<string, Payment[]>()
    for (const p of paymentsData) {
      const arr = paymentsByOrder.get(p.order_id) || []
      arr.push(p)
      paymentsByOrder.set(p.order_id, arr)
    }
    const orderMap = new Map(orders.map((o) => [o.id, o]))

    setOrders(
      orders.map((o) => ({
        ...o,
        customerName: customerMap.get(o.customer_id),
        total: orderTotal(itemsByOrder.get(o.id) || []),
        paid: orderAmountPaid(paymentsByOrder.get(o.id) || []),
      })),
    )
    setPayments(
      paymentsData.map((p) => ({
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

  async function handleComp(months: number | null) {
    if (!org) return
    const compAccessUntil = months === null ? null : new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase
      .from("organizations")
      .update({
        subscription_status: months === null ? "expired" : "comped",
        comp_access_until: compAccessUntil,
      })
      .eq("id", org.id)
    if (error) {
      toast.error("Failed to update access")
      return
    }
    setOrg({ ...org, subscription_status: months === null ? "expired" : "comped", comp_access_until: compAccessUntil })
    notify.success(months === null ? "Complimentary access revoked" : `Complimentary access granted for ${months} months`)
  }

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

      <Card>
        <CardHeader>
          <CardTitle>Complimentary Access</CardTitle>
          <CardDescription>
            Overrides the trial/subscription for this organization only — useful for a demo, an early customer, or your own test shop.
            {org.comp_access_until && (
              <> Currently comped until {formatDateTime(org.comp_access_until)}.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleComp(1)}>Comp 1 Month</Button>
          <Button variant="outline" size="sm" onClick={() => handleComp(12)}>Comp 1 Year</Button>
          <Button variant="outline" size="sm" onClick={() => handleComp(null)}>Revoke Comp</Button>
        </CardContent>
      </Card>

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
