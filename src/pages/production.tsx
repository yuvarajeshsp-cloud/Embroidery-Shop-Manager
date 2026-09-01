import * as React from "react"
import { User, Calendar } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import {
  formatDate,
  formatDateTime,
  stageFields,
  summarizeStageHistory,
} from "@/lib/helpers"
import type {
  Order,
  Customer,
  ProductionRecord,
  ProductionStageHistory,
  OrderItem,
} from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { OrderStatusBadge } from "@/components/status-badges"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "@/lib/router"
import { fetchConfigItems } from "@/lib/config"
import { toast } from "sonner"

interface BoardColumn {
  stage: string
  orders: (Order & { customer?: Customer; production?: ProductionRecord })[]
}

export function ProductionPage() {
  const [columns, setColumns] = React.useState<BoardColumn[]>([])
  const [loading, setLoading] = React.useState(true)
  const [operators, setOperators] = React.useState<string[]>([])
  const [stages, setStages] = React.useState<string[]>([])
  const [stageStatuses, setStageStatuses] = React.useState<string[]>([])
  const [selectedOrder, setSelectedOrder] = React.useState<string | null>(null)

  React.useEffect(() => {
    const init = async () => {
      const stagesData = await fetchConfigItems("production_stage")
      const statusesData = await fetchConfigItems("stage_status")
      const operatorsData = await fetchConfigItems("operator")
      
      const stageNames = stagesData.map((i) => i.name)
      setStages(stageNames)
      setStageStatuses(statusesData.map((i) => i.name))
      setOperators(operatorsData.map((i) => i.name))
      
      // Load board with the stages data
      loadBoard(stageNames)
    }
    init()
  }, [])

  async function loadBoard(stagesParam?: string[]) {
    setLoading(true)
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .not("order_status", "eq", "Delivered")
      .not("order_status", "eq", "Cancelled")
      .order("order_date", { ascending: false })

    if (!orders) { setLoading(false); return }

    const orderIds = orders.map((o: Order) => o.id)
    const customerIds = [...new Set(orders.map((o: Order) => o.customer_id))]
    const [prodRes, custRes] = await Promise.all([
      supabase.from("production_records").select("*").in("order_id", orderIds),
      supabase.from("customers").select("*").in("id", customerIds),
    ])

    const prodMap = new Map((prodRes.data || []).map((p: ProductionRecord) => [p.order_id, p]))
    const custMap = new Map((custRes.data || []).map((c: Customer) => [c.id, c]))

    const enriched = orders.map((o: Order) => ({
      ...o,
      customer: custMap.get(o.customer_id),
      production: prodMap.get(o.id),
    }))

    const stagesToUse = stagesParam || stages
    const boardColumns = stagesToUse.map((stage) => ({
      stage,
      orders: enriched.filter((o) => (o.production?.overall_stage || "Not Scheduled") === stage),
    }))

    setColumns(boardColumns)
    setLoading(false)
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Loading production board...</div>
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Production Board" description="Kanban-style board for tracking embroidery production" />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.stage} className="flex w-72 shrink-0 flex-col gap-2">
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
                      <OrderStatusBadge status={o.order_status} />
                    </div>
                    <span className="text-sm">{o.customer?.customer_business_name || "—"}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="size-3" />
                      {o.production?.assigned_operator || "Unassigned"}
                    </div>
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
        <ProductionDetailDialog
          orderId={selectedOrder}
          operators={operators}
          stageStatuses={stageStatuses}
          onClose={() => setSelectedOrder(null)}
          onSaved={() => { setSelectedOrder(null); loadBoard() }}
        />
      )}
    </div>
  )
}

function ProductionDetailDialog({
  orderId,
  operators,
  stageStatuses,
  onClose,
  onSaved,
}: {
  orderId: string
  operators: string[]
  stageStatuses: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const { navigate } = useRouter()
  const [order, setOrder] = React.useState<Order | null>(null)
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [items, setItems] = React.useState<OrderItem[]>([])
  const [production, setProduction] = React.useState<ProductionRecord | null>(null)
  const [history, setHistory] = React.useState<ProductionStageHistory[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showReason, setShowReason] = React.useState<string | null>(null)
  const [reasonText, setReasonText] = React.useState("")

  React.useEffect(() => {
    loadAll()
  }, [orderId])

  async function loadAll() {
    setLoading(true)
    const { data: orderData } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()
    setOrder(orderData as Order | null)

    if (orderData) {
      const [custRes, itemsRes, prodRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", orderData.customer_id).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", orderId),
        supabase.from("production_records").select("*").eq("order_id", orderId).eq("is_active", true).maybeSingle(),
      ])
      setCustomer(custRes.data as Customer | null)
      setItems(itemsRes.data || [])
      setProduction(prodRes.data as ProductionRecord | null)

      if (prodRes.data) {
        const { data: histData } = await supabase
          .from("production_stage_history")
          .select("*")
          .eq("production_id", prodRes.data.id)
          .order("changed_at", { ascending: false })
        setHistory(histData || [])
      }
    }
    setLoading(false)
  }

  const fields = stageFields()

  async function ensureProductionRecord(): Promise<ProductionRecord | null> {
    if (production) return production
    const { data, error } = await supabase
      .from("production_records")
      .insert({ order_id: orderId, assigned_operator: "Unassigned", overall_stage: "Not Scheduled", is_active: true })
      .select()
      .single()
    if (error) {
      toast.error("Failed to create production record")
      return null
    }
    setProduction(data as ProductionRecord)
    return data as ProductionRecord
  }

  async function handleFieldChange(field: string, value: string, dateField: string | null) {
    const record = await ensureProductionRecord()
    if (!record) return

    setShowReason(field)
    const prevValue = (record as unknown as Record<string, string>)[field] || ""
    setReasonText("")

    const updates: Record<string, unknown> = { [field]: value, updated_at: new Date().toISOString(), updated_by: profile?.id }
    if (dateField && value === "Completed") {
      updates[dateField] = new Date().toISOString().split("T")[0]
    }
    if (dateField && value === "Not Started") {
      updates[dateField] = null
    }

    const { error } = await supabase.from("production_records").update(updates).eq("id", record.id)
    if (error) {
      toast.error("Failed to update stage")
      return
    }

    await supabase.from("production_stage_history").insert({
      production_id: record.id,
      field_name: field,
      previous_value: prevValue,
      new_value: value,
      changed_by: profile?.id,
      reason: reasonText || null,
    })

    await logAudit(profile, "production_records", record.id, "UPDATE", { [field]: prevValue }, { [field]: value })
    toast.success("Stage updated")
    loadAll()
    setShowReason(null)
  }

  async function handleOperatorChange(operator: string) {
    const record = await ensureProductionRecord()
    if (!record) return
    const prev = record.assigned_operator
    const { error } = await supabase
      .from("production_records")
      .update({ assigned_operator: operator, updated_at: new Date().toISOString(), updated_by: profile?.id })
      .eq("id", record.id)
    if (error) {
      toast.error("Failed to update operator")
    } else {
      await supabase.from("production_stage_history").insert({
        production_id: record.id,
        field_name: "assigned_operator",
        previous_value: prev,
        new_value: operator,
        changed_by: profile?.id,
      })
      toast.success("Operator assigned")
      loadAll()
    }
  }

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent><div className="py-8 text-center text-muted-foreground">Loading...</div></DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Production: {order?.order_number}</DialogTitle>
          <DialogDescription>
            {customer?.customer_business_name} — {items.length} item(s)
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Operator */}
          <div className="flex items-center gap-2">
            <Label className="w-32 text-sm">Operator</Label>
            <Select
              value={production?.assigned_operator || "Unassigned"}
              onValueChange={handleOperatorChange}
            >
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {operators.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Stage fields */}
          <div className="rounded-lg border">
            <div className="border-b p-3 text-sm font-medium">Production Stages</div>
            <div className="flex flex-col gap-3 p-3">
              {fields.map((f) => {
                const status = (production?.[f.key as keyof ProductionRecord] as string) || "Not Started"
                return (
                  <div key={f.key} className="flex items-center gap-2">
                    <Label className="w-32 text-sm">{f.label}</Label>
                    <Select
                      value={status}
                      onValueChange={(v) => handleFieldChange(f.key, v, f.dateKey)}
                    >
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stageStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {f.dateKey && (production?.[f.dateKey as keyof ProductionRecord] as string) && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(production?.[f.dateKey as keyof ProductionRecord] as string)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reason dialog */}
          {showReason && (
            <Dialog open onOpenChange={() => setShowReason(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reason for Change</DialogTitle>
                  <DialogDescription>Why is this stage being changed? (optional)</DialogDescription>
                </DialogHeader>
                <Textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  rows={3}
                  placeholder="e.g. Customer approved sample, design file received..."
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowReason(null)}>Skip</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Stage history */}
          {history.length > 0 && (
            <div className="rounded-lg border">
              <div className="border-b p-3 text-sm font-medium">Stage History</div>
              <div className="flex flex-col gap-2 p-3">
                {summarizeStageHistory(history).slice(0, 8).map((h, i) => (
                  <div key={i} className="flex items-start justify-between text-xs">
                    <div className="flex flex-col">
                      <span className="font-medium">{h.field}</span>
                      <span className="text-muted-foreground">
                        {h.previous} → {h.newValue}
                      </span>
                      {h.reason && <span className="text-muted-foreground italic">"{h.reason}"</span>}
                    </div>
                    <span className="text-muted-foreground">{formatDateTime(h.changedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items summary */}
          {items.length > 0 && (
            <div className="rounded-lg border">
              <div className="border-b p-3 text-sm font-medium">Order Items</div>
              <div className="flex flex-col gap-1 p-3">
                {items.map((item, i) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{i + 1}. {item.product_type} — {item.product_description || item.design_name_number || "—"}</span>
                    <span className="text-muted-foreground">Qty: {item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => navigate({ name: "order-detail", id: orderId })}>
              View Full Order
            </Button>
            <Button size="sm" onClick={onSaved}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
