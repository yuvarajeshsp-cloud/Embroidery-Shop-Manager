import * as React from "react"
import { Calendar } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { formatDate } from "@/lib/helpers"
import type { Order, Customer } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { OrderStatusBadge, PriorityBadge } from "@/components/status-badges"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "@/lib/router"
import { fetchConfigItems, PRODUCTION_BOARD_STAGE_CATEGORY } from "@/lib/config"
import { toast } from "sonner"

interface BoardColumn {
  stage: string
  orders: (Order & { customer?: Customer })[]
}

export function ProductionPage() {
  const [columns, setColumns] = React.useState<BoardColumn[]>([])
  const [loading, setLoading] = React.useState(true)
  const [stages, setStages] = React.useState<string[]>([])
  const [selectedOrder, setSelectedOrder] = React.useState<string | null>(null)

  React.useEffect(() => {
    const init = async () => {
      const boardStageData = await fetchConfigItems(PRODUCTION_BOARD_STAGE_CATEGORY)
      let stageNames = boardStageData.map((i) => i.name)
      if (stageNames.length === 0) {
        const statusData = await fetchConfigItems("order_status")
        stageNames = statusData.map((i) => i.name)
      }
      setStages(stageNames)
      loadBoard(stageNames)
    }
    init()
  }, [])

  async function loadBoard(stagesParam?: string[]) {
    setLoading(true)
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .eq("archived", false)
      .order("order_date", { ascending: false })

    if (!orders) { setLoading(false); return }

    const customerIds = [...new Set(orders.map((o: Order) => o.customer_id))]
    const { data: customers } = await supabase.from("customers").select("*").in("id", customerIds)
    const custMap = new Map((customers || []).map((c: Customer) => [c.id, c]))

    const enriched = orders.map((o: Order) => ({
      ...o,
      customer: custMap.get(o.customer_id),
    }))

    const stagesToUse = stagesParam || stages
    const boardColumns = stagesToUse.map((stage) => ({
      stage,
      orders: enriched.filter((o) => o.order_status === stage),
    }))

    setColumns(boardColumns)
    setLoading(false)
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Loading production board...</div>
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader
        title="Production Board"
        description="Kanban-style board tracking orders by status. Configure stages under Configuration → Production Stages."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {columns.map((col) => (
          <div key={col.stage} className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <span className="text-sm font-medium">{col.stage}</span>
              <Badge variant="secondary">{col.orders.length}</Badge>
            </div>
            <div className="flex flex-col gap-2">
              {col.orders.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No orders
                </div>
              ) : (
                col.orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setSelectedOrder(o.id)}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium">{o.order_number}</span>
                      <PriorityBadge priority={o.priority} />
                    </div>
                    <span className="text-sm">{o.customer?.customer_business_name || "—"}</span>
                    {o.required_date && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="size-3" />
                        Due: {formatDate(o.required_date)}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedOrder && (
        <OrderStageDialog
          orderId={selectedOrder}
          stages={stages}
          onClose={() => setSelectedOrder(null)}
          onSaved={() => { setSelectedOrder(null); loadBoard() }}
        />
      )}
    </div>
  )
}

function OrderStageDialog({
  orderId,
  stages,
  onClose,
  onSaved,
}: {
  orderId: string
  stages: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const { navigate } = useRouter()
  const [order, setOrder] = React.useState<Order | null>(null)
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [itemCount, setItemCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    loadAll()
  }, [orderId])

  async function loadAll() {
    setLoading(true)
    const { data: orderData } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()
    setOrder(orderData as Order | null)

    if (orderData) {
      const [custRes, itemsRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", orderData.customer_id).maybeSingle(),
        supabase.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", orderId),
      ])
      setCustomer(custRes.data as Customer | null)
      setItemCount(itemsRes.count || 0)
    }
    setLoading(false)
  }

  async function handleStageChange(newStatus: string) {
    if (!order || newStatus === order.order_status) return
    setSaving(true)
    const updates: Partial<Order> = { order_status: newStatus, updated_at: new Date().toISOString(), updated_by: profile?.id }
    if (newStatus === "Delivered") {
      updates.actual_delivery_date = new Date().toISOString().split("T")[0]
    }
    const { error } = await supabase.from("orders").update(updates).eq("id", order.id)
    if (error) {
      toast.error("Failed to update stage")
      setSaving(false)
      return
    }
    await logAudit(
      profile,
      "orders",
      order.id,
      "UPDATE",
      { order_status: order.order_status } as Record<string, unknown>,
      { order_status: newStatus } as Record<string, unknown>,
      `Production stage changed to ${newStatus}`,
    )
    toast.success(`Moved to ${newStatus}`)
    setSaving(false)
    onSaved()
  }

  if (loading || !order) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent><div className="py-8 text-center text-muted-foreground">Loading...</div></DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{order.order_number}</DialogTitle>
          <DialogDescription>
            {customer?.customer_business_name} — {itemCount} item(s) — Current: {order.order_status}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={order.order_status} />
            {order.required_date && (
              <span className="text-xs text-muted-foreground">Due: {formatDate(order.required_date)}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === order.order_status ? "default" : "outline"}
                disabled={saving}
                onClick={() => handleStageChange(s)}
              >
                {s}
              </Button>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => navigate({ name: "order-detail", id: orderId })}>
              View Full Order
            </Button>
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
