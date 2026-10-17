import * as React from "react"
import { Calendar } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { formatDate } from "@/lib/helpers"
import type { Order, Customer } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useVocabulary } from "@/lib/shop-type"
import { OrderStatusBadge, PriorityBadge } from "@/components/status-badges"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "@/lib/router"
import { fetchConfigItems, PRODUCTION_BOARD_STAGE_CATEGORY } from "@/lib/config"
import { toast } from "sonner"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"
import { useOnline } from "@/lib/offline/connectivity"

type BoardOrder = Order & { customer?: Customer }

/** "Rajesh Kumar" -> "RK". */
function initialsOf(name: string | undefined): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const MOVE_MS = 420
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/**
 * Smooth card movement (FLIP): after every render, any card that ended up
 * somewhere else — another column, or just shuffled down by a neighbour —
 * slides from where it was to where it is. New cards fade in.
 */
function useCardMotion(root: React.RefObject<HTMLElement | null>, ready: boolean) {
  const last = React.useRef(new Map<string, DOMRect>())
  React.useLayoutEffect(() => {
    const el = root.current
    if (!el || !ready) return
    const next = new Map<string, DOMRect>()
    const animate = !reducedMotion() && last.current.size > 0
    el.querySelectorAll<HTMLElement>("[data-card]").forEach((card) => {
      const id = card.dataset.card!
      // Measure where the card truly sits, not where a running slide has it.
      card.getAnimations().forEach((a) => a.cancel())
      const box = card.getBoundingClientRect()
      next.set(id, box)
      if (!animate) return
      const before = last.current.get(id)
      if (!before) {
        card.animate(
          [{ opacity: 0, transform: "scale(0.92)" }, { opacity: 1, transform: "scale(1)" }],
          { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        )
        return
      }
      const dx = before.left - box.left
      const dy = before.top - box.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      card.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: MOVE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      )
    })
    last.current = next
  })
}

export function ProductionPage() {
  const vocab = useVocabulary()
  const { profile } = useAuth()
  const online = useOnline()
  const [orders, setOrders] = React.useState<BoardOrder[]>([])
  const [customers, setCustomers] = React.useState<Map<string, Customer>>(new Map())
  const [people, setPeople] = React.useState<Map<string, string>>(new Map())
  const [loading, setLoading] = React.useState(true)
  const [stages, setStages] = React.useState<string[]>([])
  const [selectedOrder, setSelectedOrder] = React.useState<string | null>(null)
  const [flashing, setFlashing] = React.useState<Set<string>>(new Set())
  const [live, setLive] = React.useState(false)
  const boardRef = React.useRef<HTMLDivElement>(null)
  const myId = profile?.id

  // The person who moved an order is shown by initials, so know everyone's name.
  React.useEffect(() => {
    supabase
      .from("user_profiles")
      .select("id, display_name")
      .then(({ data }) => setPeople(new Map((data || []).map((u: { id: string; display_name: string }) => [u.id, u.display_name]))))
  }, [])

  const loadBoard = React.useCallback(async () => {
    const { data: rows } = await supabase
      .from("orders")
      .select("*")
      .eq("archived", false)
      .order("order_date", { ascending: false })
    if (!rows) return
    const ids = [...new Set(rows.map((o: Order) => o.customer_id))]
    const { data: custs } = await supabase.from("customers").select("*").in("id", ids)
    const map = new Map<string, Customer>((custs || []).map((c: Customer) => [c.id, c]))
    setCustomers(map)
    setOrders(rows.map((o: Order) => ({ ...o, customer: map.get(o.customer_id) })))
  }, [])

  React.useEffect(() => {
    const init = async () => {
      const boardStageData = await fetchConfigItems(PRODUCTION_BOARD_STAGE_CATEGORY)
      let stageNames = boardStageData.map((i) => i.name)
      if (stageNames.length === 0) {
        const statusData = await fetchConfigItems("order_status")
        stageNames = statusData.map((i) => i.name)
      }
      setStages(stageNames)
      await loadBoard()
      setLoading(false)
    }
    void init()
  }, [loadBoard])

  /** Puts one order (from this device or from the live feed) into the board. */
  const applyOrder = React.useCallback(
    (row: Order, announce: boolean) => {
      setOrders((prev) => {
        const i = prev.findIndex((o) => o.id === row.id)
        if (row.archived) return i >= 0 ? prev.filter((o) => o.id !== row.id) : prev
        if (i < 0) {
          const added = [{ ...row, customer: customers.get(row.customer_id) }, ...prev]
          return added.sort((a, b) => (a.order_date < b.order_date ? 1 : a.order_date > b.order_date ? -1 : 0))
        }
        const copy = [...prev]
        copy[i] = { ...copy[i], ...row, customer: copy[i].customer ?? customers.get(row.customer_id) }
        return copy
      })
      if (announce) {
        setFlashing((f) => new Set(f).add(row.id))
        window.setTimeout(
          () =>
            setFlashing((f) => {
              const n = new Set(f)
              n.delete(row.id)
              return n
            }),
          3200,
        )
      }
      // A customer the board hasn't seen yet (a brand-new order).
      if (!customers.has(row.customer_id)) {
        void supabase
          .from("customers")
          .select("*")
          .eq("id", row.customer_id)
          .maybeSingle()
          .then(({ data }) => {
            if (!data) return
            setCustomers((m) => new Map(m).set(data.id, data as Customer))
            setOrders((prev) => prev.map((o) => (o.customer_id === data.id ? { ...o, customer: data as Customer } : o)))
          })
      }
    },
    [customers],
  )

  // Listen for changes from everyone in the shop.
  const applyRef = React.useRef(applyOrder)
  applyRef.current = applyOrder
  const ordersRef = React.useRef(orders)
  ordersRef.current = orders
  React.useEffect(() => {
    const channel = supabase
      .channel("production-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id
          if (id) setOrders((prev) => prev.filter((o) => o.id !== id))
          return
        }
        const row = payload.new as Order
        // Only a move made by someone else is called out.
        const was = ordersRef.current.find((o) => o.id === row.id)
        const moved = !was || was.order_status !== row.order_status
        applyRef.current(row, moved && row.status_changed_by !== myId)
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"))
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [myId])

  // Coming back online: catch up on whatever was missed.
  const wasOnline = React.useRef(online)
  React.useEffect(() => {
    if (online && !wasOnline.current) void loadBoard()
    wasOnline.current = online
  }, [online, loadBoard])

  const columns = React.useMemo(
    () => stages.map((stage) => ({ stage, orders: orders.filter((o) => o.order_status === stage) })),
    [stages, orders],
  )

  useCardMotion(boardRef, !loading)

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Loading production board...</div>
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader
        title={vocab.boardName}
        description="Kanban-style board tracking orders by status. Configure stages under Configuration → Production Stages."
      >
        {live && online && (
          <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground" title="Changes by your team appear here as they happen">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        )}
      </PageHeader>

      <div ref={boardRef} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                col.orders.map((o) => {
                  const who = o.status_changed_by ? people.get(o.status_changed_by) : undefined
                  const initials = initialsOf(who)
                  return (
                    <button
                      key={o.id}
                      data-card={o.id}
                      onClick={() => setSelectedOrder(o.id)}
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-sm transition-[background-color,box-shadow,border-color] duration-700 hover:bg-accent",
                        flashing.has(o.id) && "border-primary bg-primary/10 shadow-md ring-2 ring-primary/40",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-medium">{o.order_number}</span>
                        <PriorityBadge priority={o.priority} />
                      </div>
                      <span className="text-sm">{o.customer?.customer_business_name || "—"}</span>
                      <div className="flex items-end justify-between gap-2">
                        {o.required_date ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="size-3" />
                            Due: {formatDate(o.required_date)}
                          </div>
                        ) : (
                          <span />
                        )}
                        {initials && (
                          <span
                            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
                            title={`Moved to ${o.order_status} by ${who}${o.status_changed_at ? ` · ${new Date(o.status_changed_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`}
                          >
                            {initials}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
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
          onSaved={(updated) => {
            setSelectedOrder(null)
            applyOrder(updated, false)
          }}
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
  onSaved: (updated: Order) => void
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
    notify.success(`Moved to ${newStatus}`)
    setSaving(false)
    // The database stamps who moved it; show the same right away.
    onSaved({ ...order, ...updates, status_changed_by: profile?.id ?? null, status_changed_at: updates.updated_at ?? null } as Order)
  }

  if (loading || !order) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent><PageLoader size="sm" /></DialogContent>
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
