import * as React from "react"
import { FEATURES } from "@/lib/features"
import {
  Download,
  Plus,
  Search,
  Pencil,
  Trash2,
  FileDown,
  Share2,
  Printer,
  MessageCircle,
  Shirt,
  Palette,
  Ruler,
  StickyNote,
  ImageIcon,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { PdfPreviewDialog } from "@/components/pdf-preview-dialog"
import { buildInvoiceBlocks, buildOrderTagBlocks } from "@/lib/printer"
import { ReceiptPrintDialog } from "@/components/receipt-print-dialog"
import {
  formatCurrency,
  formatDate,
  formatNumber,
  generatePaymentNumber,
  orderItemUnitPrice,
  orderItemTotal,
  orderTotal,
  orderDiscountAmount,
  discountLabel,
  orderSetupCharges,
  orderAdditionalCostsTotal,
  orderAmountPaid,
  orderBalanceDue,
  derivePaymentStatus,
  isOverdue,
} from "@/lib/helpers"
import type { Order, OrderItem, OrderAdditionalCost, Payment, Customer, UserProfile, Expense } from "@/lib/types"
import { ASSIGNABLE_ROLES } from "@/lib/permissions"
import type { ExportField } from "@/lib/export"
import { computeDateRange, isWithinRange, type DateRangePreset } from "@/lib/date-range"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AdditionalCostForm } from "@/components/additional-cost-form"
import { DiscountDialog } from "@/components/discount-form"
import { ItemPriceFields, formLineTotal, formUnitPrice, priceColumns, priceProblem, type ItemPriceValues } from "@/components/item-price-fields"
import { isTerminalStatus, defaultPricingMode, itemQuantityText, pricingModeOf, useShopType, useVocabulary } from "@/lib/shop-type"
import { OrderStatusBadge, PriorityBadge, PaymentStatusBadge, PaymentMethodBadge, PaymentRecordStatusBadge, ExpenseCategoryBadge } from "@/components/status-badges"
import { useRouter } from "@/lib/router"
import { useIsMobile } from "@/hooks/use-mobile"
import { fetchConfigItems, getDefaultStitchRate } from "@/lib/config"
import { toast } from "sonner"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { DateRangeFilter } from "@/components/date-range-filter"
import { ExportDialog } from "@/components/export-dialog"
import { ExpenseForm } from "@/pages/expenses"
import { UserInfoButton } from "@/components/info-card"
import { AttachmentSection, AttachmentThumb } from "@/components/attachment-section"
import { AttachmentViewerDialog } from "@/components/attachment-viewer"
import { Checkbox } from "@/components/ui/checkbox"
import { getAttachmentUrl } from "@/lib/attachments"
import { fetchAttachmentsForItems } from "@/lib/attachments"
import { sendOrderStatusUpdate, sendWhatsAppFile, getWhatsAppMediaType } from "@/lib/whatsapp"
import { uploadOrderInvoicePdf } from "@/lib/pdf"
import {
  shareThermalInvoiceViaWhatsApp,
} from "@/lib/thermal-print"
import type { OrderItemAttachment } from "@/lib/types"

type EnrichedOrder = Order & {
  customer?: Customer
  order_items?: OrderItem[]
  order_additional_costs?: OrderAdditionalCost[]
  payments?: Payment[]
  thumbnailAttachment?: OrderItemAttachment
}

export function OrdersPage() {
  const { navigate } = useRouter()
  const isMobile = useIsMobile()
  const [orders, setOrders] = React.useState<EnrichedOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<Set<string>>(new Set())
  const [priorityFilter, setPriorityFilter] = React.useState<Set<string>>(new Set())
  const [customerFilter, setCustomerFilter] = React.useState<Set<string>>(new Set())
  const [channelFilter, setChannelFilter] = React.useState<Set<string>>(new Set())
  const [orderStatuses, setOrderStatuses] = React.useState<string[]>([])
  const [priorities, setPriorities] = React.useState<string[]>([])
  const [salesChannels, setSalesChannels] = React.useState<string[]>([])
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>("all_time")
  const [customFrom, setCustomFrom] = React.useState("")
  const [customTo, setCustomTo] = React.useState("")
  const [showExport, setShowExport] = React.useState(false)
  const [assigneeMap, setAssigneeMap] = React.useState<Map<string, string>>(new Map())

  React.useEffect(() => {
    fetchConfigItems("order_status").then((items) => setOrderStatuses(items.map((i) => i.name)))
    fetchConfigItems("priority").then((items) => setPriorities(items.map((i) => i.name)))
    fetchConfigItems("sales_channel").then((items) => setSalesChannels(items.map((i) => i.name)))
    supabase.from("user_profiles").select("id,display_name").then(({ data }) => {
      setAssigneeMap(new Map((data || []).map((u: { id: string; display_name: string }) => [u.id, u.display_name])))
    })
    loadOrders()
  }, [])

  async function loadOrders() {
    // Reloading after a save keeps the page as it is; the spinner is only for the first load.
    const query = supabase.from("orders").select("*").eq("archived", false).order("order_date", { ascending: false })
    const { data: orderData } = await query
    if (!orderData) { setLoading(false); return }

    const customerIds = [...new Set(orderData.map((o: Order) => o.customer_id))]
    const [customersRes, itemsRes, paymentsRes, costsRes] = await Promise.all([
      supabase.from("customers").select("*").in("id", customerIds),
      supabase.from("order_items").select("*"),
      supabase.from("payments").select("*"),
      supabase.from("order_additional_costs").select("*"),
    ])
    const costsByOrder = new Map<string, OrderAdditionalCost[]>()
    for (const c of (costsRes.data || []) as OrderAdditionalCost[]) {
      const arr = costsByOrder.get(c.order_id) || []
      arr.push(c)
      costsByOrder.set(c.order_id, arr)
    }

    const customerMap = new Map((customersRes.data || []).map((c: Customer) => [c.id, c]))
    const itemsByOrder = new Map<string, OrderItem[]>()
    const orderIdByItemId = new Map<string, string>()
    for (const item of itemsRes.data || []) {
      const arr = itemsByOrder.get(item.order_id) || []
      arr.push(item)
      itemsByOrder.set(item.order_id, arr)
      orderIdByItemId.set(item.id, item.order_id)
    }
    const paymentsByOrder = new Map<string, Payment[]>()
    for (const p of paymentsRes.data || []) {
      const arr = paymentsByOrder.get(p.order_id) || []
      arr.push(p)
      paymentsByOrder.set(p.order_id, arr)
    }

    const allAttachments = await fetchAttachmentsForItems([...orderIdByItemId.keys()])
    const thumbnailByOrder = new Map<string, OrderItemAttachment>()
    for (const a of [...allAttachments].sort(
      (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime(),
    )) {
      const orderId = orderIdByItemId.get(a.order_item_id)
      if (orderId && !thumbnailByOrder.has(orderId)) thumbnailByOrder.set(orderId, a)
    }

    setOrders(
      orderData.map((o: Order) => ({
        ...o,
        customer: customerMap.get(o.customer_id),
        order_items: itemsByOrder.get(o.id) || [],
        payments: paymentsByOrder.get(o.id) || [],
        order_additional_costs: costsByOrder.get(o.id) || [],
        thumbnailAttachment: thumbnailByOrder.get(o.id),
      })),
    )
    setLoading(false)
  }

  const dateRange = computeDateRange(datePreset, customFrom, customTo)

  const customerOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const o of orders) {
      if (o.customer) map.set(o.customer.id, `${o.customer.customer_business_name} (${o.customer.customer_code})`)
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [orders])

  const filtered = orders.filter((o) => {
    const matchesSearch =
      !search ||
      o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      (o.customer?.customer_business_name || "").toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter.size === 0 || statusFilter.has(o.order_status)
    const matchesPriority = priorityFilter.size === 0 || priorityFilter.has(o.priority)
    const matchesCustomer = customerFilter.size === 0 || customerFilter.has(o.customer_id)
    const matchesChannel = channelFilter.size === 0 || channelFilter.has(o.sales_channel || "")
    const matchesDate = isWithinRange(o.order_date, dateRange)
    return matchesSearch && matchesStatus && matchesPriority && matchesCustomer && matchesChannel && matchesDate
  })

  const orderExportFields: ExportField<EnrichedOrder>[] = [
    { key: "order_number", label: "Order Number", value: (o) => o.order_number },
    { key: "order_date", label: "Order Date", value: (o) => formatDate(o.order_date) },
    { key: "customer", label: "Customer", value: (o) => o.customer?.customer_business_name || "" },
    { key: "customer_code", label: "Customer Code", value: (o) => o.customer?.customer_code || "" },
    { key: "order_status", label: "Status", value: (o) => o.order_status },
    { key: "priority", label: "Priority", value: (o) => o.priority },
    { key: "required_date", label: "Delivery Date", value: (o) => (o.required_date ? formatDate(o.required_date) : "") },
    { key: "trial_date", label: "Trial Date", value: (o) => (o.trial_date ? formatDate(o.trial_date) : "") },
    { key: "sales_channel", label: "Sales Channel", value: (o) => o.sales_channel || "" },
    { key: "assigned_to", label: "Assigned To", value: (o) => (o.assigned_to && assigneeMap.get(o.assigned_to)) || "Unassigned" },
    { key: "customer_po_reference", label: "PO Reference", value: (o) => o.customer_po_reference || "" },
    { key: "order_total", label: "Order Total", value: (o) => orderTotal(o.order_items || [], o.order_additional_costs || [], o) },
    { key: "amount_paid", label: "Amount Paid", value: (o) => orderAmountPaid(o.payments || []) },
    { key: "balance_due", label: "Balance Due", value: (o) => orderBalanceDue(o.order_items || [], o.payments || [], o.order_additional_costs || [], o) },
    { key: "discount", label: "Discount", value: (o) => orderDiscountAmount(o.order_items || [], o.order_additional_costs || [], o) },
    { key: "payment_status", label: "Payment Status", value: (o) => derivePaymentStatus(o.order_items || [], o.payments || [], o.order_additional_costs || [], o) },
    { key: "item_count", label: "Item Count", value: (o) => (o.order_items || []).length },
  ]

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Orders" description="Manage all embroidery orders">
        <Button variant="outline" onClick={() => setShowExport(true)} size="sm">
          <Download className="size-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button onClick={() => navigate({ name: "order-new" })} size="sm">
          <Plus className="size-4" />
          New Order
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by order number or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MultiSelectFilter
          label="Status"
          options={orderStatuses.map((s) => ({ value: s, label: s }))}
          selected={statusFilter}
          onChange={setStatusFilter}
          className="w-full sm:w-auto"
        />
        <MultiSelectFilter
          label="Priority"
          options={priorities.map((p) => ({ value: p, label: p }))}
          selected={priorityFilter}
          onChange={setPriorityFilter}
          className="w-full sm:w-auto"
        />
        <MultiSelectFilter
          label="Customer"
          options={customerOptions}
          selected={customerFilter}
          onChange={setCustomerFilter}
          className="w-full sm:w-auto"
        />
        <MultiSelectFilter
          label="Sales Channel"
          options={salesChannels.map((s) => ({ value: s, label: s }))}
          selected={channelFilter}
          onChange={setChannelFilter}
          className="w-full sm:w-auto"
        />
        <DateRangeFilter
          preset={datePreset}
          onPresetChange={setDatePreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <PageLoader size="sm" />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No orders found. Click "New Order" to create one.
            </div>
          ) : isMobile ? (
            <div className="flex flex-col divide-y">
              {filtered.map((o) => {
                const total = orderTotal(o.order_items || [], o.order_additional_costs || [], o)
                const payStatus = derivePaymentStatus(o.order_items || [], o.payments || [], o.order_additional_costs || [], o)
                const overdue = isOverdue(o.required_date) && !isTerminalStatus(o.order_status)
                return (
                  <button
                    key={o.id}
                    onClick={() => navigate({ name: "order-detail", id: o.id })}
                    className="flex items-start gap-3 p-4 text-left active:bg-accent"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                      {o.thumbnailAttachment ? (
                        <img
                          src={getAttachmentUrl(o.thumbnailAttachment.file_path)}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium">{o.order_number}</span>
                      <span className="font-semibold">{formatCurrency(total)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {o.customer?.customer_business_name || "—"}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatDate(o.order_date)}</span>
                      {o.required_date && (
                        <span className={cn(overdue && "font-medium text-red-600")}>
                          Due {formatDate(o.required_date)}
                          {overdue && " (Overdue)"}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <OrderStatusBadge status={o.order_status} />
                      <PriorityBadge priority={o.priority} />
                      <PaymentStatusBadge status={payStatus} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Assigned: {(o.assigned_to && assigneeMap.get(o.assigned_to)) || "Unassigned"}
                    </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => {
                  const total = orderTotal(o.order_items || [], o.order_additional_costs || [], o)
                  const payStatus = derivePaymentStatus(o.order_items || [], o.payments || [], o.order_additional_costs || [], o)
                  const overdue = isOverdue(o.required_date) && !isTerminalStatus(o.order_status)
                  return (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ name: "order-detail", id: o.id })}
                    >
                      <TableCell>
                        <div className="flex size-9 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                          {o.thumbnailAttachment ? (
                            <img
                              src={getAttachmentUrl(o.thumbnailAttachment.file_path)}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="size-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">{o.order_number}</TableCell>
                      <TableCell>{o.customer?.customer_business_name || "—"}</TableCell>
                      <TableCell className="text-xs">{formatDate(o.order_date)}</TableCell>
                      <TableCell className="text-xs">
                        {o.required_date ? (
                          <span className={cn(overdue && "font-medium text-red-600")}>
                            {formatDate(o.required_date)}
                            {overdue && " (Overdue)"}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell><OrderStatusBadge status={o.order_status} /></TableCell>
                      <TableCell><PriorityBadge priority={o.priority} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(o.assigned_to && assigneeMap.get(o.assigned_to)) || "Unassigned"}
                      </TableCell>
                      <TableCell><PaymentStatusBadge status={payStatus} /></TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(total)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        title="Export Orders"
        filename="orders"
        sheetName="Orders"
        rows={filtered}
        fields={orderExportFields}
      />
    </div>
  )
}

// ============================================================
// ORDER DETAIL PAGE
// ============================================================

export function OrderDetailPage({ id }: { id: string }) {
  const { navigate } = useRouter()
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [order, setOrder] = React.useState<Order | null>(null)
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [items, setItems] = React.useState<OrderItem[]>([])
  const [attachments, setAttachments] = React.useState<OrderItemAttachment[]>([])
  const [viewingAttachment, setViewingAttachment] = React.useState<OrderItemAttachment | null>(null)
  const [payments, setPayments] = React.useState<Payment[]>([])
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [additionalCosts, setAdditionalCosts] = React.useState<OrderAdditionalCost[]>([])
  const [discountOpen, setDiscountOpen] = React.useState(false)
  const [costForm, setCostForm] = React.useState<{ itemId: string; cost: OrderAdditionalCost | null } | null>(null)
  const [loading, setLoading] = React.useState(true)
  // Which order the page is currently showing: a spinner only when it changes.
  const shownId = React.useRef<string | null>(null)
  const [editingItem, setEditingItem] = React.useState<OrderItem | null>(null)
  const [showItemForm, setShowItemForm] = React.useState(false)
  const [showPaymentForm, setShowPaymentForm] = React.useState(false)
  const [showStatusChange, setShowStatusChange] = React.useState(false)
  const [showShareToCustomer, setShowShareToCustomer] = React.useState(false)
  const [pdfOpen, setPdfOpen] = React.useState(false)
  const [orderStatuses, setOrderStatuses] = React.useState<string[]>([])
  const [receiptDialog, setReceiptDialog] = React.useState<"invoice" | "tag" | null>(null)
  const [assignableUsers, setAssignableUsers] = React.useState<UserProfile[]>([])

  const canReassign = profile?.role === "Administrator" || profile?.role === "Manager"
  const vocab = useVocabulary()
  const [showEditOrder, setShowEditOrder] = React.useState(false)
  const [expenseForm, setExpenseForm] = React.useState<{ expense: Expense | null } | null>(null)
  const canRecordExpense = profile?.role === "Administrator" || profile?.role === "Manager" || profile?.role === "Accounts"
  const [editingMaterial, setEditingMaterial] = React.useState(false)
  const [materialDraft, setMaterialDraft] = React.useState("")

  async function handleOrderField(patch: { trial_date?: string | null; material_received?: string | null }) {
    if (!order) return
    const { error } = await supabase
      .from("orders")
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: profile?.id })
      .eq("id", order.id)
    if (error) {
      toast.error("Failed to save")
      return
    }
    setOrder({ ...order, ...patch } as Order)
  }

  React.useEffect(() => {
    fetchConfigItems("order_status").then((items) => setOrderStatuses(items.map((i) => i.name)))
    supabase.from("user_profiles").select("*").in("role", ASSIGNABLE_ROLES).eq("is_active", true).order("display_name")
      .then(({ data }) => setAssignableUsers(data || []))
    loadOrder()
  }, [id])

  async function loadOrder() {
    if (shownId.current !== id) setLoading(true)
    const { data: orderData } = await supabase.from("orders").select("*").eq("id", id).maybeSingle()
    if (!orderData) { setLoading(false); return }
    setOrder(orderData as Order)

    const [custRes, itemsRes, payRes, expRes, costRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", orderData.customer_id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", id).order("item_number"),
      supabase.from("payments").select("*").eq("order_id", id).order("payment_date", { ascending: false }),
      supabase.from("expenses").select("*").eq("order_id", id).order("expense_date", { ascending: false }),
      supabase.from("order_additional_costs").select("*").eq("order_id", id).order("created_at"),
    ])
    setAdditionalCosts((costRes.data || []) as OrderAdditionalCost[])
    setCustomer(custRes.data as Customer | null)
    const orderItems = itemsRes.data || []
    setItems(orderItems)
    setPayments(payRes.data || [])
    setExpenses(expRes.data || [])
    setAttachments(await fetchAttachmentsForItems(orderItems.map((i: OrderItem) => i.id)))
    shownId.current = id
    setLoading(false)
  }

  async function handleStatusChange(newStatus: string) {
    if (!order) return
    const updates: Partial<Order> = { order_status: newStatus, updated_at: new Date().toISOString(), updated_by: profile?.id }
    if (newStatus === "Delivered") {
      updates.actual_delivery_date = new Date().toISOString().split("T")[0]
    }
    const { error } = await supabase.from("orders").update(updates).eq("id", order.id)
    if (error) {
      toast.error("Failed to update status")
    } else {
      await logAudit(profile, "orders", order.id, "UPDATE", { order_status: order.order_status } as Record<string, unknown>, { order_status: newStatus } as Record<string, unknown>, `Status changed to ${newStatus}`)
      notify.success(`Order status changed to ${newStatus}`)
      const updatedOrder = { ...order, ...updates } as Order
      setOrder(updatedOrder)

      if (FEATURES.whatsapp && customer?.whatsapp_opt_in) {
        sendOrderStatusUpdate(customer, updatedOrder, newStatus, profile?.id).then((result) => {
          if (!result.success) {
            toast.error(`WhatsApp update not sent: ${result.error}`)
          }
        })
      }
    }
    setShowStatusChange(false)
  }

  async function handleAssign(userId: string | null) {
    if (!order) return
    const { error } = await supabase
      .from("orders")
      .update({ assigned_to: userId, updated_at: new Date().toISOString(), updated_by: profile?.id })
      .eq("id", order.id)
    if (error) {
      toast.error("Failed to update assignment")
    } else {
      await logAudit(profile, "orders", order.id, "UPDATE", { assigned_to: order.assigned_to } as Record<string, unknown>, { assigned_to: userId } as Record<string, unknown>, "Reassigned")
      notify.success("Order assignment updated")
      setOrder({ ...order, assigned_to: userId })
    }
  }

  async function handleDeleteCost(cost: OrderAdditionalCost) {
    if (!confirm(`Remove ${cost.cost_type}?`)) return
    const { error } = await supabase.from("order_additional_costs").delete().eq("id", cost.id)
    if (error) {
      toast.error("Failed to remove the cost")
    } else {
      notify.success("Cost removed")
      setAdditionalCosts((prev) => prev.filter((c) => c.id !== cost.id))
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Delete this item?")) return
    const { error } = await supabase.from("order_items").delete().eq("id", itemId)
    if (error) {
      toast.error("Failed to delete item")
    } else {
      notify.success("Item deleted")
      loadOrder()
    }
  }

  if (loading) {
    return <PageLoader />
  }
  if (!order) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Order not found</div>
  }

  const total = orderTotal(items, additionalCosts, order)
  const setup = orderSetupCharges(items)
  const extrasTotal = orderAdditionalCostsTotal(additionalCosts)
  const anyStitchItem = items.some((i) => pricingModeOf(i) === "stitch")
  const discountAmount = orderDiscountAmount(items, additionalCosts, order)
  const subtotal = total + discountAmount - setup - extrasTotal
  const paid = orderAmountPaid(payments)
  const balance = orderBalanceDue(items, payments, additionalCosts, order)
  const payStatus = derivePaymentStatus(items, payments, additionalCosts, order)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader
        title={order.order_number}
        description={`Ordered ${formatDate(order.order_date)}`}
        actions={
          <>
              <Button variant="outline" size="sm" onClick={() => setShowStatusChange(true)}>
                Change Status
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
                <FileDown className="size-4" />
                {isMobile ? "Download / Print PDF" : "PDF"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReceiptDialog("invoice")}>
                <Printer className="size-4" />
                Print Invoice
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReceiptDialog("tag")}>
                <Printer className="size-4" />
                {isMobile ? "Print Order Tag" : "Print Tag"}
              </Button>
              {FEATURES.whatsapp && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowShareToCustomer(true)}
                  >
                    <Share2 className="size-4" />
                    Share to Customer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await shareThermalInvoiceViaWhatsApp({ order, customer, items, payments, additionalCosts })
                      } catch (err) {
                        console.error(err)
                        toast.error(err instanceof Error ? err.message : "Failed to share")
                      }
                    }}
                  >
                    <MessageCircle className="size-4" />
                    WhatsApp
                  </Button>
                </>
              )}
          </>
        }
      >
        <Button variant="outline" size="sm" onClick={() => navigate({ name: "orders" })}>
          Back to Orders
        </Button>
      </PageHeader>

      {/* Order info + status */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Order Information</CardTitle>
            {canReassign && (
              <Button variant="outline" size="sm" onClick={() => setShowEditOrder(true)}>
                <Pencil className="size-3.5" />
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Customer</span>
              <button
                className="text-sm font-medium hover:underline"
                onClick={() => customer && navigate({ name: "customer-detail", id: customer.id })}
              >
                {customer?.customer_business_name || "—"}
              </button>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Order Date</span>
              <span className="text-sm">{formatDate(order.order_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Delivery Date</span>
              <span className={cn("text-sm", isOverdue(order.required_date) && "font-medium text-red-600")}>
                {formatDate(order.required_date)}
                {isOverdue(order.required_date) && " (Overdue)"}
              </span>
            </div>
            {(vocab.usesTrialDate || order.trial_date) && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Trial / Fitting</span>
                {canReassign ? (
                  <Input
                    type="date"
                    className="h-7 w-[150px] px-2 text-xs"
                    value={order.trial_date || ""}
                    onChange={(e) => handleOrderField({ trial_date: e.target.value || null })}
                  />
                ) : (
                  <span className="text-sm">{formatDate(order.trial_date)}</span>
                )}
              </div>
            )}
            {(vocab.usesMaterialReceived || order.material_received) && (
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-xs text-muted-foreground">Material Received</span>
                {editingMaterial ? (
                  <Input
                    autoFocus
                    className="h-7 text-xs"
                    value={materialDraft}
                    onChange={(e) => setMaterialDraft(e.target.value)}
                    onBlur={() => {
                      setEditingMaterial(false)
                      const next = materialDraft.trim() || null
                      if (next !== (order.material_received || null)) void handleOrderField({ material_received: next })
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={!canReassign}
                    className="text-right text-sm enabled:hover:underline"
                    onClick={() => {
                      setMaterialDraft(order.material_received || "")
                      setEditingMaterial(true)
                    }}
                  >
                    {order.material_received || (canReassign ? "Add…" : "—")}
                  </button>
                )}
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Priority</span>
              <PriorityBadge priority={order.priority} />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <OrderStatusBadge status={order.order_status} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Assigned To</span>
              <span className="flex items-center gap-1">
              {canReassign ? (
                <Select
                  value={order.assigned_to || "unassigned"}
                  onValueChange={(v) => handleAssign(v === "unassigned" ? null : v)}
                >
                  <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.display_name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm">
                  {assignableUsers.find((u) => u.id === order.assigned_to)?.display_name || "Unassigned"}
                </span>
              )}
              <UserInfoButton user={assignableUsers.find((u) => u.id === order.assigned_to)} />
              </span>
            </div>
            {order.customer_po_reference && (
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">PO Reference</span>
                <span className="text-sm">{order.customer_po_reference}</span>
              </div>
            )}
            {order.sales_channel && (
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Sales Channel</span>
                <span className="text-sm">{order.sales_channel}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment Summary</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Subtotal</span>
              <span className="text-sm">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">{vocab.setupLabel}</span>
              <span className="text-sm">{formatCurrency(setup)}</span>
            </div>
            {additionalCosts.map((c) => (
              <div key={c.id} className="flex justify-between gap-3">
                <span className="text-xs text-muted-foreground">{c.cost_type}</span>
                <span className="text-sm">{formatCurrency(c.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {discountAmount > 0 ? (
                  <>
                    Discount ({discountLabel(order)})
                    {order.discount_reason && <span className="block text-[11px]">{order.discount_reason}</span>}
                  </>
                ) : (
                  "Discount"
                )}
              </span>
              <span className="flex items-center gap-2">
                {discountAmount > 0 && <span className="text-sm text-emerald-600">−{formatCurrency(discountAmount)}</span>}
                <Button variant="ghost" size="xs" onClick={() => setDiscountOpen(true)}>
                  {discountAmount > 0 ? "Edit" : "Add"}
                </Button>
              </span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-sm font-medium">Total</span>
              <span className="text-sm font-bold">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Paid</span>
              <span className="text-sm text-emerald-600">{formatCurrency(paid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Balance</span>
              <span className="text-sm font-bold text-amber-600">{formatCurrency(balance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Payment Status</span>
              <PaymentStatusBadge status={payStatus} />
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowPaymentForm(true)}>
              <Plus className="size-4" />
              Record Payment
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Order Items */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Order Items</CardTitle>
          <Button size="sm" onClick={() => { setEditingItem(null); setShowItemForm(true) }}>
            <Plus className="size-4" /> Add Item
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No items added yet</p>
          ) : isMobile ? (
            <div className="flex flex-col divide-y">
              {items.map((item, idx) => (
                <div key={item.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                      <Badge variant="outline">{item.product_type}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => { setEditingItem(item); setShowItemForm(true) }}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteItem(item.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {item.product_description && (
                    <div className="text-sm">{item.product_description}</div>
                  )}
                  {item.design_name_number && (
                    <div className="text-xs text-muted-foreground">{vocab.designLabel.split("/")[0].trim()}: {item.design_name_number}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {pricingModeOf(item) === "stitch" ? (
                      <>
                        <span>Qty {item.quantity}</span>
                        <span>{formatNumber(item.stitches_per_unit)} stitches</span>
                        <span>Rate {item.rate_per_1000_stitches.toFixed(2)}/1K</span>
                      </>
                    ) : (
                      <span>{itemQuantityText(item)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Unit {formatCurrency(orderItemUnitPrice(item))}
                    </span>
                    <span className="font-semibold">{formatCurrency(orderItemTotal(item))}</span>
                  </div>
                  <ItemCosts
                    costs={additionalCosts.filter((c) => c.order_item_id === item.id)}
                    onAdd={() => setCostForm({ itemId: item.id, cost: null })}
                    onEdit={(c) => setCostForm({ itemId: item.id, cost: c })}
                    onDelete={handleDeleteCost}
                  />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>{vocab.designLabel.split("/")[0].trim()}</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  {anyStitchItem && <TableHead className="text-right">Stitches</TableHead>}
                  {anyStitchItem && <TableHead className="text-right">Rate/1K</TableHead>}
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell className="text-xs">{idx + 1}</TableCell>
                    <TableCell><Badge variant="outline">{item.product_type}</Badge></TableCell>
                    <TableCell className="max-w-[200px] text-sm">{item.product_description || "—"}</TableCell>
                    <TableCell className="text-sm">{item.design_name_number || "—"}</TableCell>
                    <TableCell className="text-right">{pricingModeOf(item) === "stitch" ? item.quantity : itemQuantityText(item)}</TableCell>
                    {anyStitchItem && (
                      <TableCell className="text-right">
                        {pricingModeOf(item) === "stitch" ? formatNumber(item.stitches_per_unit) : "—"}
                      </TableCell>
                    )}
                    {anyStitchItem && (
                      <TableCell className="text-right">
                        {pricingModeOf(item) === "stitch" ? item.rate_per_1000_stitches.toFixed(2) : "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right">{formatCurrency(orderItemUnitPrice(item))}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(orderItemTotal(item))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => { setEditingItem(item); setShowItemForm(true) }}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteItem(item.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell />
                    <TableCell colSpan={anyStitchItem ? 9 : 7} className="pb-3 pt-0">
                      <ItemCosts
                        costs={additionalCosts.filter((c) => c.order_item_id === item.id)}
                        onAdd={() => setCostForm({ itemId: item.id, cost: null })}
                        onEdit={(c) => setCostForm({ itemId: item.id, cost: c })}
                        onDelete={handleDeleteCost}
                      />
                    </TableCell>
                  </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {expenseForm && (
        <ExpenseForm
          expense={expenseForm.expense}
          orderId={order.id}
          onClose={() => setExpenseForm(null)}
          onSaved={() => {
            setExpenseForm(null)
            void loadOrder()
          }}
        />
      )}
      {showEditOrder && (
        <OrderEditDialog
          order={order}
          onClose={() => setShowEditOrder(false)}
          onSaved={(patch) => {
            setShowEditOrder(false)
            setOrder({ ...order, ...patch } as Order)
          }}
        />
      )}
      {discountOpen && (
        <DiscountDialog
          order={order}
          items={items}
          extras={additionalCosts}
          onClose={() => setDiscountOpen(false)}
          onSaved={() => {
            setDiscountOpen(false)
            void loadOrder()
          }}
        />
      )}
      {costForm && (
        <AdditionalCostForm
          orderId={order.id}
          orderItemId={costForm.itemId}
          cost={costForm.cost}
          onClose={() => setCostForm(null)}
          onSaved={() => {
            setCostForm(null)
            void loadOrder()
          }}
        />
      )}

      {/* Attachments across all items */}
      {attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attachments</CardTitle>
            <CardDescription>Customer material and design confirmation files across all order items</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {items.map((item, idx) => {
              const itemAttachments = attachments.filter((a) => a.order_item_id === item.id)
              if (itemAttachments.length === 0) return null
              const material = itemAttachments.filter((a) => a.category === "material")
              const design = itemAttachments.filter((a) => a.category === "design_confirmation")
              return (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium">
                    Item {idx + 1} — {item.product_type}
                    {item.product_description ? `: ${item.product_description}` : ""}
                  </span>
                  {material.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Customer Material</span>
                      <div className="flex flex-wrap gap-2">
                        {material.map((a) => <AttachmentThumb key={a.id} attachment={a} onView={() => setViewingAttachment(a)} />)}
                      </div>
                    </div>
                  )}
                  {design.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Design Confirmation</span>
                      <div className="flex flex-wrap gap-2">
                        {design.map((a) => <AttachmentThumb key={a.id} attachment={a} onView={() => setViewingAttachment(a)} />)}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Payments */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payments recorded yet</p>
          ) : isMobile ? (
            <div className="flex flex-col divide-y">
              {payments.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm">{p.payment_number}</span>
                    <span className="font-semibold">{formatCurrency(p.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>{formatDate(p.payment_date)}</span>
                    {p.transaction_reference && <span>{p.transaction_reference}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PaymentMethodBadge method={p.payment_method} />
                    <PaymentRecordStatusBadge status={p.payment_status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.payment_number}</TableCell>
                    <TableCell className="text-sm">{formatDate(p.payment_date)}</TableCell>
                    <TableCell><PaymentMethodBadge method={p.payment_method} /></TableCell>
                    <TableCell className="text-sm">{p.transaction_reference || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(p.amount)}</TableCell>
                    <TableCell><PaymentRecordStatusBadge status={p.payment_status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Expenses</CardTitle>
          <div className="flex gap-2">
            {canRecordExpense && (
              <Button size="sm" onClick={() => setExpenseForm({ expense: null })}>
                <Plus className="size-4" /> Add Expense
              </Button>
            )}
            {expenses.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => navigate({ name: "expenses" })}>
                Manage
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {expenses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No expenses recorded for this order</p>
          ) : isMobile ? (
            <div className="flex flex-col divide-y">
              {expenses.map((e) => (
                <div key={e.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm">{e.expense_number}</span>
                    <span className="flex items-center gap-2 font-semibold">
                      {formatCurrency(e.amount)}
                      {canRecordExpense && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setExpenseForm({ expense: e })}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <ExpenseCategoryBadge category={e.category} />
                    <span>{formatDate(e.expense_date)}</span>
                  </div>
                  {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expense #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canRecordExpense && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.expense_number}</TableCell>
                    <TableCell className="text-sm">{formatDate(e.expense_date)}</TableCell>
                    <TableCell><ExpenseCategoryBadge category={e.category} /></TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">{e.description || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(e.amount)}</TableCell>
                    {canRecordExpense && (
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" onClick={() => setExpenseForm({ expense: e })}>
                          <Pencil className="size-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {(order.special_instructions || order.internal_notes) && (
        <div className="grid gap-4 md:grid-cols-2">
          {order.special_instructions && (
            <Card>
              <CardHeader><CardTitle>Special Instructions</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{order.special_instructions}</p></CardContent>
            </Card>
          )}
          {order.internal_notes && (
            <Card>
              <CardHeader><CardTitle>Internal Notes</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{order.internal_notes}</p></CardContent>
            </Card>
          )}
        </div>
      )}

      {showItemForm && (
        <OrderItemForm
          orderId={order.id}
          itemNumber={items.length + 1}
          item={editingItem}
          onClose={() => setShowItemForm(false)}
          onSaved={() => { setShowItemForm(false); loadOrder() }}
        />
      )}

      {showPaymentForm && (
        <PaymentForm
          orderId={order.id}
          customerId={order.customer_id}
          balance={balance}
          onClose={() => setShowPaymentForm(false)}
          onSaved={() => { setShowPaymentForm(false); loadOrder() }}
        />
      )}

      {showStatusChange && (
        <Dialog open onOpenChange={() => setShowStatusChange(false)}>
          <DialogContent fullPage={false}>
            <DialogHeader>
              <DialogTitle>Change Order Status</DialogTitle>
              <DialogDescription>Current: {order.order_status}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-2">
              {orderStatuses.map((s) => (
                <Button
                  key={s}
                  variant={s === order.order_status ? "default" : "outline"}
                  onClick={() => handleStatusChange(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AttachmentViewerDialog attachment={viewingAttachment} onClose={() => setViewingAttachment(null)} />

      {pdfOpen && (
        <PdfPreviewDialog data={{ order, customer, items, payments, additionalCosts }} onClose={() => setPdfOpen(false)} />
      )}
      {receiptDialog === "invoice" && (
        <ReceiptPrintDialog
          title={`Invoice ${order.order_number}`}
          load={() => buildInvoiceBlocks({ order, customer, items, payments, additionalCosts })}
          onClose={() => setReceiptDialog(null)}
        />
      )}
      {receiptDialog === "tag" && (
        <ReceiptPrintDialog
          title={`Order Tag ${order.order_number}`}
          load={() => buildOrderTagBlocks(order, customer)}
          onClose={() => setReceiptDialog(null)}
        />
      )}

      {FEATURES.whatsapp && showShareToCustomer && (
        <ShareToCustomerDialog
          order={order}
          customer={customer}
          items={items}
          payments={payments}
          additionalCosts={additionalCosts}
          attachments={attachments}
          onClose={() => setShowShareToCustomer(false)}
        />
      )}
    </div>
  )
}

// ============================================================
// SHARE TO CUSTOMER DIALOG
// ============================================================

function ShareToCustomerDialog({
  order,
  customer,
  items,
  payments,
  additionalCosts,
  attachments,
  onClose,
}: {
  order: Order
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
  additionalCosts: OrderAdditionalCost[]
  attachments: OrderItemAttachment[]
  onClose: () => void
}) {
  const { profile } = useAuth()
  const [sendInvoice, setSendInvoice] = React.useState(true)
  const [sendDesign, setSendDesign] = React.useState(false)
  const [sendMaterial, setSendMaterial] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  const designFiles = attachments.filter((a) => a.category === "design_confirmation")
  const materialFiles = attachments.filter((a) => a.category === "material")
  const recipient = customer?.whatsapp || customer?.phone || ""
  const canSend = !!customer && !!recipient

  async function sendFile(file: OrderItemAttachment, kind: "design_confirmation" | "customer_material") {
    if (!customer) return false
    const mediaType = getWhatsAppMediaType(file.file_type)
    if (!mediaType) {
      toast.error(`"${file.file_name}" isn't a file type WhatsApp supports (only JPEG/PNG images or PDF/Office documents) — skipped`)
      return false
    }
    const result = await sendWhatsAppFile(customer, order, mediaType, getAttachmentUrl(file.file_path), file.file_name, kind, profile?.id)
    return result.success
  }

  async function handleSend() {
    if (!customer || !canSend) return
    setSending(true)
    let successCount = 0
    let failCount = 0
    try {
      if (sendInvoice) {
        try {
          const { url, fileName } = await uploadOrderInvoicePdf({ order, customer, items, payments, additionalCosts })
          const result = await sendWhatsAppFile(customer, order, "document", url, fileName, "invoice", profile?.id)
          if (result.success) successCount++
          else failCount++
        } catch (err) {
          console.error(err)
          failCount++
        }
      }
      if (sendDesign) {
        for (const file of designFiles) {
          const ok = await sendFile(file, "design_confirmation")
          ok ? successCount++ : failCount++
        }
      }
      if (sendMaterial) {
        for (const file of materialFiles) {
          const ok = await sendFile(file, "customer_material")
          ok ? successCount++ : failCount++
        }
      }

      if (successCount > 0) notify.success(`Sent ${successCount} file(s) via WhatsApp`)
      if (failCount > 0) toast.error(`${failCount} file(s) failed to send`)
      if (successCount > 0 && failCount === 0) onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share to Customer via WhatsApp</DialogTitle>
          <DialogDescription>
            {canSend ? `Sending to ${recipient}` : "This customer has no phone/WhatsApp number on file"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center gap-2">
            <Checkbox checked={sendInvoice} onCheckedChange={(v) => setSendInvoice(!!v)} />
            <Label className="font-normal">Invoice (PDF)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={sendDesign}
              disabled={designFiles.length === 0}
              onCheckedChange={(v) => setSendDesign(!!v)}
            />
            <Label className="font-normal">Design Confirmation files ({designFiles.length})</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={sendMaterial}
              disabled={materialFiles.length === 0}
              onCheckedChange={(v) => setSendMaterial(!!v)}
            />
            <Label className="font-normal">Customer Material Photos ({materialFiles.length})</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !canSend || (!sendInvoice && !sendDesign && !sendMaterial)}>
            {sending ? "Sending..." : "Send via WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// ORDER ITEM FORM
// ============================================================

/** An item's additional costs: one line each, with a way to add more. */
function ItemCosts({
  costs,
  onAdd,
  onEdit,
  onDelete,
}: {
  costs: OrderAdditionalCost[]
  onAdd: () => void
  onEdit: (cost: OrderAdditionalCost) => void
  onDelete: (cost: OrderAdditionalCost) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      {costs.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">{c.cost_type}</span>
          <span className="flex shrink-0 items-center gap-1">
            <span className="font-medium">{formatCurrency(c.amount)}</span>
            <Button variant="ghost" size="icon-xs" onClick={() => onEdit(c)}>
              <Pencil className="size-3" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => onDelete(c)}>
              <Trash2 className="size-3" />
            </Button>
          </span>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3" /> Add cost
      </button>
    </div>
  )
}

function OrderItemForm({
  orderId,
  itemNumber,
  item,
  onClose,
  onSaved,
}: {
  orderId: string
  itemNumber: number
  item: OrderItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const wasNew = item === null
  const [saving, setSaving] = React.useState(false)
  const [savedItemId, setSavedItemId] = React.useState<string | null>(item?.id ?? null)
  const [productTypes, setProductTypes] = React.useState<string[]>([])
  const [defaultRate, setDefaultRate] = React.useState(10)
  const shopType = useShopType()
  const vocab = useVocabulary()
  const [form, setForm] = React.useState({
    product_type: item?.product_type || "Other",
    product_description: item?.product_description || "",
    design_name_number: item?.design_name_number || "",
    size_placement: item?.size_placement || "",
    pricing_mode: item ? pricingModeOf(item) : defaultPricingMode(shopType),
    quantity: item?.quantity || 1,
    stitches_per_unit: item?.stitches_per_unit || 0,
    rate_per_1000_stitches: item?.rate_per_1000_stitches || 10,
    manual_unit_price: item?.manual_unit_price != null ? String(item.manual_unit_price) : "",
    setup_digitizing_charge: item?.setup_digitizing_charge || 0,
    notes: item?.notes || "",
  })

  React.useEffect(() => {
    fetchConfigItems("product_type").then((items) => setProductTypes(items.map((i) => i.name)))
    getDefaultStitchRate().then(setDefaultRate)
  }, [])

  React.useEffect(() => {
    if (!item) {
      setForm((f) => ({ ...f, rate_per_1000_stitches: defaultRate }))
    }
  }, [defaultRate, item])

  const priceValues: ItemPriceValues = form
  const unitPrice = formUnitPrice(priceValues)
  const lineTotal = formLineTotal(priceValues)

  async function handleSave() {
    if (!form.product_description.trim() && form.product_type === "Other") {
      toast.error("Description is required for 'Other' product type")
      return
    }
    const problem = priceProblem(priceValues)
    if (problem) {
      toast.error(problem)
      return
    }
    setSaving(true)
    try {
      const payload = {
        order_id: orderId,
        item_number: item?.item_number || itemNumber,
        product_type: form.product_type,
        product_description: form.product_description || null,
        design_name_number: form.design_name_number || null,
        size_placement: form.size_placement || null,
        ...priceColumns(priceValues),
        notes: form.notes || null,
      }
      if (savedItemId) {
        const { error } = await supabase.from("order_items").update(payload).eq("id", savedItemId)
        if (error) throw error
        if (wasNew) {
          notify.success("Changes saved")
        } else {
          notify.success("Item updated")
          onSaved()
        }
      } else {
        const { data, error } = await supabase.from("order_items").insert(payload).select().single()
        if (error) throw error
        setSavedItemId(data.id)
        notify.success("Item added — attach photos or documents below, then click Done")
      }
    } catch (err) {
      console.error(err)
      toast.error("Failed to save item")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{savedItemId ? "Edit Item" : "Add Item"}</DialogTitle>
          {wasNew && !savedItemId && (
            <DialogDescription>Save the item first to unlock photo/document attachments.</DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-6 py-2">
          <div className="grid grid-cols-2 items-end gap-5">
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
                <Shirt className="size-3.5" /> {vocab.productLabel}
              </Label>
              <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {productTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
                <Palette className="size-3.5" /> {vocab.designLabel}
              </Label>
              <Input
                value={form.design_name_number}
                onChange={(e) => setForm({ ...form, design_name_number: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="font-normal text-muted-foreground">Product Description</Label>
            <Textarea
              value={form.product_description}
              onChange={(e) => setForm({ ...form, product_description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
              <Ruler className="size-3.5" /> {vocab.sizeLabel}
            </Label>
            <Input
              value={form.size_placement}
              onChange={(e) => setForm({ ...form, size_placement: e.target.value })}
              placeholder={vocab.sizePlaceholder}
            />
          </div>
          <ItemPriceFields values={priceValues} onChange={(patch) => setForm({ ...form, ...patch })} />
          <div className="flex flex-col gap-1 border-t pt-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Price per {form.pricing_mode === "metre" ? "metre" : form.pricing_mode === "fixed" ? "item" : "unit"}</span>
              <span>{formatCurrency(unitPrice)}</span>
            </div>
            <div className="flex justify-between pt-1.5 text-base font-semibold">
              <span>
                Line Total ({form.pricing_mode === "fixed" ? "1" : form.quantity || 0} × {formatCurrency(unitPrice)})
              </span>
              <span>{formatCurrency(lineTotal)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
              <StickyNote className="size-3.5" /> Notes
            </Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>

          {savedItemId && (
            <div className="flex flex-col gap-4 border-t pt-4">
              <AttachmentSection orderItemId={savedItemId} category="material" label="Customer Material Photos" />
              <AttachmentSection orderItemId={savedItemId} category="design_confirmation" label="Design Confirmation" />
            </div>
          )}
        </div>
        <DialogFooter>
          {wasNew && savedItemId ? (
            <>
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button onClick={onSaved}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// PAYMENT FORM
// ============================================================

function PaymentForm({
  orderId,
  customerId,
  balance,
  onClose,
  onSaved,
}: {
  orderId: string
  customerId: string
  balance: number
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const [saving, setSaving] = React.useState(false)
  const [paymentMethods, setPaymentMethods] = React.useState<string[]>([])
  const [form, setForm] = React.useState({
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "Cash",
    amount: balance > 0 ? balance : 0,
    transaction_reference: "",
    notes: "",
    payment_status: "Completed",
  })

  React.useEffect(() => {
    fetchConfigItems("payment_method").then((items) => setPaymentMethods(items.map((i) => i.name)))
  }, [])

  async function handleSave() {
    if (!form.amount || form.amount <= 0) {
      toast.error("Amount must be greater than 0")
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from("payments").insert({
        payment_number: generatePaymentNumber(),
        payment_date: form.payment_date,
        order_id: orderId,
        customer_id: customerId,
        payment_method: form.payment_method,
        amount: form.amount,
        transaction_reference: form.transaction_reference || null,
        notes: form.notes || null,
        payment_status: form.payment_status,
        created_by: profile?.id,
        updated_by: profile?.id,
      })
      if (error) throw error
      notify.success("Payment recorded")
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error("Failed to record payment")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Balance due: {formatCurrency(balance)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>Payment Date</Label>
            <Input
              type="date"
              value={form.payment_date}
              onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={Number.isNaN(form.amount) ? "" : form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Transaction Reference</Label>
            <Input
              value={form.transaction_reference}
              onChange={(e) => setForm({ ...form, transaction_reference: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Edit an order's own details: dates, priority, channel and notes. Status, assignee and items keep their own controls. */
function OrderEditDialog({
  order,
  onClose,
  onSaved,
}: {
  order: Order
  onClose: () => void
  onSaved: (patch: Partial<Order>) => void
}) {
  const { profile } = useAuth()
  const vocab = useVocabulary()
  const [priorities, setPriorities] = React.useState<string[]>([])
  const [channels, setChannels] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    order_date: order.order_date,
    required_date: order.required_date || "",
    trial_date: order.trial_date || "",
    priority: order.priority,
    sales_channel: order.sales_channel || "",
    material_received: order.material_received || "",
    special_instructions: order.special_instructions || "",
  })

  React.useEffect(() => {
    fetchConfigItems("priority").then((items) => setPriorities(items.map((i) => i.name)))
    fetchConfigItems("sales_channel").then((items) => setChannels(items.map((i) => i.name)))
  }, [])

  // A saved value whose list entry has since been removed stays selectable.
  const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [current, ...list] : list)

  async function handleSave() {
    if (!form.order_date) {
      toast.error("Order date is required")
      return
    }
    if (form.required_date && form.required_date < form.order_date) {
      toast.error("Delivery date can't be before the order date")
      return
    }
    const patch = {
      order_date: form.order_date,
      required_date: form.required_date || null,
      trial_date: form.trial_date || null,
      priority: form.priority,
      sales_channel: form.sales_channel || null,
      material_received: form.material_received.trim() || null,
      special_instructions: form.special_instructions.trim() || null,
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from("orders")
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: profile?.id })
        .eq("id", order.id)
      if (error) throw error
      await logAudit(
        profile,
        "orders",
        order.id,
        "UPDATE",
        Object.fromEntries(Object.keys(patch).map((k) => [k, order[k as keyof Order]])) as Record<string, unknown>,
        patch as Record<string, unknown>,
      )
      notify.success(`Order ${order.order_number} updated`)
      onSaved(patch)
    } catch (err) {
      console.error(err)
      toast.error("Failed to save the order")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Order {order.order_number}</DialogTitle>
          <DialogDescription>Status, assignee, items and discount are changed from the order page itself.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Order date</Label>
            <Input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Delivery date</Label>
            <Input type="date" value={form.required_date} onChange={(e) => setForm({ ...form, required_date: e.target.value })} />
          </div>
          {(vocab.usesTrialDate || order.trial_date) && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Trial / Fitting</Label>
              <Input type="date" value={form.trial_date} onChange={(e) => setForm({ ...form, trial_date: e.target.value })} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {withCurrent(priorities, form.priority).map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Sales channel</Label>
            <Select value={form.sales_channel || "none"} onValueChange={(v) => setForm({ ...form, sales_channel: v === "none" ? "" : v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {withCurrent(channels, form.sales_channel).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(vocab.usesMaterialReceived || order.material_received) && (
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-xs">Material received</Label>
              <Input value={form.material_received} onChange={(e) => setForm({ ...form, material_received: e.target.value })} />
            </div>
          )}
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs">Special instructions</Label>
            <Textarea rows={3} value={form.special_instructions} onChange={(e) => setForm({ ...form, special_instructions: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
