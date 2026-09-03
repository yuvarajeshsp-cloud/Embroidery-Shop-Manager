import * as React from "react"
import { Download, Plus, Search, Pencil, Trash2, FileDown, Share2, Printer, Eye } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { downloadOrderPdf } from "@/lib/pdf"
import {
  formatCurrency,
  formatDate,
  formatNumber,
  generatePaymentNumber,
  orderItemUnitPrice,
  orderItemTotal,
  orderTotal,
  orderSetupCharges,
  orderAmountPaid,
  orderBalanceDue,
  derivePaymentStatus,
  isOverdue,
} from "@/lib/helpers"
import type { Order, OrderItem, Payment, Customer } from "@/lib/types"
import type { ExportField } from "@/lib/export"
import { computeDateRange, isWithinRange, type DateRangePreset } from "@/lib/date-range"
import { PageHeader } from "@/components/page-header"
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
import { OrderStatusBadge, PriorityBadge, PaymentStatusBadge } from "@/components/status-badges"
import { Spinner } from "@/components/ui/spinner"
import { useRouter } from "@/lib/router"
import { fetchConfigItems, getDefaultStitchRate } from "@/lib/config"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { DateRangeFilter } from "@/components/date-range-filter"
import { ExportDialog } from "@/components/export-dialog"
import { AttachmentSection, AttachmentThumb } from "@/components/attachment-section"
import { AttachmentViewerDialog } from "@/components/attachment-viewer"
import { Checkbox } from "@/components/ui/checkbox"
import { getAttachmentUrl } from "@/lib/attachments"
import { fetchAttachmentsForItems } from "@/lib/attachments"
import { sendOrderStatusUpdate, sendWhatsAppFile, getWhatsAppMediaType } from "@/lib/whatsapp"
import { uploadOrderInvoicePdf } from "@/lib/pdf"
import {
  printThermalInvoice,
  printThermalOrderTag,
  getThermalInvoiceHtml,
  getThermalOrderTagHtml,
} from "@/lib/thermal-print"
import type { OrderItemAttachment } from "@/lib/types"

type EnrichedOrder = Order & { customer?: Customer; order_items?: OrderItem[]; payments?: Payment[] }

export function OrdersPage() {
  const { navigate } = useRouter()
  const [orders, setOrders] = React.useState<EnrichedOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<Set<string>>(new Set())
  const [priorityFilter, setPriorityFilter] = React.useState<Set<string>>(new Set())
  const [customerFilter, setCustomerFilter] = React.useState<Set<string>>(new Set())
  const [channelFilter, setChannelFilter] = React.useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = React.useState(false)
  const [orderStatuses, setOrderStatuses] = React.useState<string[]>([])
  const [priorities, setPriorities] = React.useState<string[]>([])
  const [salesChannels, setSalesChannels] = React.useState<string[]>([])
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>("all_time")
  const [customFrom, setCustomFrom] = React.useState("")
  const [customTo, setCustomTo] = React.useState("")
  const [showExport, setShowExport] = React.useState(false)

  React.useEffect(() => {
    fetchConfigItems("order_status").then((items) => setOrderStatuses(items.map((i) => i.name)))
    fetchConfigItems("priority").then((items) => setPriorities(items.map((i) => i.name)))
    fetchConfigItems("sales_channel").then((items) => setSalesChannels(items.map((i) => i.name)))
    loadOrders()
  }, [])

  async function loadOrders() {
    setLoading(true)
    let query = supabase.from("orders").select("*").order("order_date", { ascending: false })
    if (!showArchived) query = query.eq("archived", false)
    const { data: orderData } = await query
    if (!orderData) { setLoading(false); return }

    const customerIds = [...new Set(orderData.map((o: Order) => o.customer_id))]
    const [customersRes, itemsRes, paymentsRes] = await Promise.all([
      supabase.from("customers").select("*").in("id", customerIds),
      supabase.from("order_items").select("*"),
      supabase.from("payments").select("*"),
    ])

    const customerMap = new Map((customersRes.data || []).map((c: Customer) => [c.id, c]))
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

    setOrders(
      orderData.map((o: Order) => ({
        ...o,
        customer: customerMap.get(o.customer_id),
        order_items: itemsByOrder.get(o.id) || [],
        payments: paymentsByOrder.get(o.id) || [],
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
    { key: "sales_channel", label: "Sales Channel", value: (o) => o.sales_channel || "" },
    { key: "customer_po_reference", label: "PO Reference", value: (o) => o.customer_po_reference || "" },
    { key: "order_total", label: "Order Total", value: (o) => orderTotal(o.order_items || []) },
    { key: "amount_paid", label: "Amount Paid", value: (o) => orderAmountPaid(o.payments || []) },
    { key: "balance_due", label: "Balance Due", value: (o) => orderBalanceDue(o.order_items || [], o.payments || []) },
    { key: "payment_status", label: "Payment Status", value: (o) => derivePaymentStatus(o.order_items || [], o.payments || []) },
    { key: "item_count", label: "Item Count", value: (o) => (o.order_items || []).length },
  ]

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Orders" description="Manage all embroidery orders">
        <Button variant="outline" onClick={() => setShowExport(true)} size="sm">
          <Download className="size-4" />
          Export
        </Button>
        <Button onClick={() => navigate({ name: "order-new" })} size="sm">
          <Plus className="size-4" />
          New Order
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
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
        />
        <MultiSelectFilter
          label="Priority"
          options={priorities.map((p) => ({ value: p, label: p }))}
          selected={priorityFilter}
          onChange={setPriorityFilter}
        />
        <MultiSelectFilter
          label="Customer"
          options={customerOptions}
          selected={customerFilter}
          onChange={setCustomerFilter}
        />
        <MultiSelectFilter
          label="Sales Channel"
          options={salesChannels.map((s) => ({ value: s, label: s }))}
          selected={channelFilter}
          onChange={setChannelFilter}
        />
        <DateRangeFilter
          preset={datePreset}
          onPresetChange={setDatePreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
        <Button
          variant={showArchived ? "default" : "outline"}
          onClick={() => { setShowArchived(!showArchived); setTimeout(loadOrders, 0) }}
          size="sm"
        >
          {showArchived ? "Showing Archived" : "Show Archived"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No orders found. Click "New Order" to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => {
                  const total = orderTotal(o.order_items || [])
                  const payStatus = derivePaymentStatus(o.order_items || [], o.payments || [])
                  const overdue = isOverdue(o.required_date) && o.order_status !== "Delivered" && o.order_status !== "Cancelled"
                  return (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ name: "order-detail", id: o.id })}
                    >
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
  const [order, setOrder] = React.useState<Order | null>(null)
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [items, setItems] = React.useState<OrderItem[]>([])
  const [attachments, setAttachments] = React.useState<OrderItemAttachment[]>([])
  const [viewingAttachment, setViewingAttachment] = React.useState<OrderItemAttachment | null>(null)
  const [payments, setPayments] = React.useState<Payment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editingItem, setEditingItem] = React.useState<OrderItem | null>(null)
  const [showItemForm, setShowItemForm] = React.useState(false)
  const [showPaymentForm, setShowPaymentForm] = React.useState(false)
  const [showStatusChange, setShowStatusChange] = React.useState(false)
  const [showShareToCustomer, setShowShareToCustomer] = React.useState(false)
  const [downloadingPdf, setDownloadingPdf] = React.useState(false)
  const [orderStatuses, setOrderStatuses] = React.useState<string[]>([])
  const [thermalPreview, setThermalPreview] = React.useState<{ title: string; html: string } | null>(null)

  React.useEffect(() => {
    fetchConfigItems("order_status").then((items) => setOrderStatuses(items.map((i) => i.name)))
    loadOrder()
  }, [id])

  async function loadOrder() {
    setLoading(true)
    const { data: orderData } = await supabase.from("orders").select("*").eq("id", id).maybeSingle()
    if (!orderData) { setLoading(false); return }
    setOrder(orderData as Order)

    const [custRes, itemsRes, payRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", orderData.customer_id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", id).order("item_number"),
      supabase.from("payments").select("*").eq("order_id", id).order("payment_date", { ascending: false }),
    ])
    setCustomer(custRes.data as Customer | null)
    const orderItems = itemsRes.data || []
    setItems(orderItems)
    setPayments(payRes.data || [])
    setAttachments(await fetchAttachmentsForItems(orderItems.map((i: OrderItem) => i.id)))
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
      toast.success(`Order status changed to ${newStatus}`)
      const updatedOrder = { ...order, ...updates } as Order
      setOrder(updatedOrder)

      if (customer?.whatsapp_opt_in) {
        sendOrderStatusUpdate(customer, updatedOrder, newStatus, profile?.id).then((result) => {
          if (!result.success) {
            toast.error(`WhatsApp update not sent: ${result.error}`)
          }
        })
      }
    }
    setShowStatusChange(false)
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Delete this item?")) return
    const { error } = await supabase.from("order_items").delete().eq("id", itemId)
    if (error) {
      toast.error("Failed to delete item")
    } else {
      toast.success("Item deleted")
      loadOrder()
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Loading...</div>
  }
  if (!order) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Order not found</div>
  }

  const total = orderTotal(items)
  const setup = orderSetupCharges(items)
  const subtotal = total - setup
  const paid = orderAmountPaid(payments)
  const balance = orderBalanceDue(items, payments)
  const payStatus = derivePaymentStatus(items, payments)

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title={order.order_number} description={`Ordered ${formatDate(order.order_date)}`}>
        <Button variant="outline" size="sm" onClick={() => navigate({ name: "orders" })}>
          Back to Orders
        </Button>
      </PageHeader>

      {/* Order info + status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Order Information</CardTitle></CardHeader>
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
              <span className="text-xs text-muted-foreground">Required Date</span>
              <span className={cn("text-sm", isOverdue(order.required_date) && "font-medium text-red-600")}>
                {formatDate(order.required_date)}
                {isOverdue(order.required_date) && " (Overdue)"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Priority</span>
              <PriorityBadge priority={order.priority} />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <OrderStatusBadge status={order.order_status} />
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
              <span className="text-xs text-muted-foreground">Setup/Digitizing</span>
              <span className="text-sm">{formatCurrency(setup)}</span>
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

        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowStatusChange(true)}>
              Change Status
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate({ name: "production" })}>
              View Production
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={downloadingPdf}
              onClick={async () => {
                setDownloadingPdf(true)
                try {
                  await downloadOrderPdf({ order, customer, items, payments })
                  toast.success("PDF downloaded")
                } catch {
                  toast.error("Failed to generate PDF")
                } finally {
                  setDownloadingPdf(false)
                }
              }}
            >
              {downloadingPdf ? <Spinner className="size-4" /> : <FileDown className="size-4" />}
              Download PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const html = await getThermalInvoiceHtml({ order, customer, items, payments })
                setThermalPreview({ title: `Invoice ${order.order_number}`, html })
              }}
            >
              <Eye className="size-4" />
              Preview Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => printThermalInvoice({ order, customer, items, payments })}
            >
              <Printer className="size-4" />
              Print Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const html = await getThermalOrderTagHtml(order, customer)
                setThermalPreview({ title: `Order Tag ${order.order_number}`, html })
              }}
            >
              <Eye className="size-4" />
              Preview Order Tag
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => printThermalOrderTag(order, customer)}
            >
              <Printer className="size-4" />
              Print Order Tag
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowShareToCustomer(true)}
            >
              <Share2 className="size-4" />
              Share to Customer
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Design</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Stitches</TableHead>
                  <TableHead className="text-right">Rate/1K</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">{idx + 1}</TableCell>
                    <TableCell><Badge variant="outline">{item.product_type}</Badge></TableCell>
                    <TableCell className="max-w-[200px] text-sm">{item.product_description || "—"}</TableCell>
                    <TableCell className="text-sm">{item.design_name_number || "—"}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.stitches_per_unit)}</TableCell>
                    <TableCell className="text-right">{item.rate_per_1000_stitches.toFixed(2)}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
                    <TableCell><Badge variant="outline">{p.payment_method}</Badge></TableCell>
                    <TableCell className="text-sm">{p.transaction_reference || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(p.amount)}</TableCell>
                    <TableCell><Badge variant="outline">{p.payment_status}</Badge></TableCell>
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
          <DialogContent>
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

      {thermalPreview && (
        <Dialog open onOpenChange={() => setThermalPreview(null)}>
          <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{thermalPreview.title}</DialogTitle>
              <DialogDescription>Preview of what will print on the 80mm thermal roll.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto rounded-md border bg-white">
              <iframe
                srcDoc={thermalPreview.html}
                title={thermalPreview.title}
                className="h-[500px] w-full"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showShareToCustomer && (
        <ShareToCustomerDialog
          order={order}
          customer={customer}
          items={items}
          payments={payments}
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
  attachments,
  onClose,
}: {
  order: Order
  customer: Customer | null
  items: OrderItem[]
  payments: Payment[]
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
          const { url, fileName } = await uploadOrderInvoicePdf({ order, customer, items, payments })
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

      if (successCount > 0) toast.success(`Sent ${successCount} file(s) via WhatsApp`)
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
  const [form, setForm] = React.useState({
    product_type: item?.product_type || "Other",
    product_description: item?.product_description || "",
    design_name_number: item?.design_name_number || "",
    size_placement: item?.size_placement || "",
    quantity: item?.quantity || 1,
    stitches_per_unit: item?.stitches_per_unit || 0,
    rate_per_1000_stitches: item?.rate_per_1000_stitches || 10,
    manual_unit_price: item?.manual_unit_price ?? "",
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

  const calculatedPrice = ((form.stitches_per_unit || 0) / 1000) * (form.rate_per_1000_stitches || 0)
  const useManual = form.manual_unit_price !== "" && form.manual_unit_price !== null
  const unitPrice = useManual ? parseFloat(form.manual_unit_price as string) : calculatedPrice
  const lineTotal = unitPrice * (form.quantity || 0)

  async function handleSave() {
    if (!form.product_description.trim() && form.product_type === "Other") {
      toast.error("Description is required for 'Other' product type")
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
        quantity: form.quantity || 1,
        stitches_per_unit: form.stitches_per_unit || 0,
        rate_per_1000_stitches: form.rate_per_1000_stitches || 0,
        manual_unit_price: useManual ? parseFloat(form.manual_unit_price as string) : null,
        setup_digitizing_charge: form.setup_digitizing_charge || 0,
        notes: form.notes || null,
      }
      if (savedItemId) {
        const { error } = await supabase.from("order_items").update(payload).eq("id", savedItemId)
        if (error) throw error
        if (wasNew) {
          toast.success("Changes saved")
        } else {
          toast.success("Item updated")
          onSaved()
        }
      } else {
        const { data, error } = await supabase.from("order_items").insert(payload).select().single()
        if (error) throw error
        setSavedItemId(data.id)
        toast.success("Item added — attach photos or documents below, then click Done")
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
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Product Type</Label>
              <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {productTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Design Name/Number</Label>
              <Input
                value={form.design_name_number}
                onChange={(e) => setForm({ ...form, design_name_number: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Product Description</Label>
            <Textarea
              value={form.product_description}
              onChange={(e) => setForm({ ...form, product_description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Size / Placement</Label>
            <Input
              value={form.size_placement}
              onChange={(e) => setForm({ ...form, size_placement: e.target.value })}
              placeholder="e.g. Left Chest 4 inch"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                value={Number.isNaN(form.quantity) ? "" : form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value === "" ? NaN : parseInt(e.target.value, 10) })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Stitches/Unit</Label>
              <Input
                type="number"
                min={0}
                value={Number.isNaN(form.stitches_per_unit) ? "" : form.stitches_per_unit}
                onChange={(e) => setForm({ ...form, stitches_per_unit: e.target.value === "" ? NaN : parseInt(e.target.value, 10) })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Rate per 1K Stitches</Label>
              <Input
                type="number"
                step="0.01"
                value={Number.isNaN(form.rate_per_1000_stitches) ? "" : form.rate_per_1000_stitches}
                onChange={(e) => setForm({ ...form, rate_per_1000_stitches: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Manual Unit Price (override)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Auto-calculate"
                value={form.manual_unit_price}
                onChange={(e) => setForm({ ...form, manual_unit_price: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Setup/Digitizing Charge</Label>
              <Input
                type="number"
                step="0.01"
                value={Number.isNaN(form.setup_digitizing_charge) ? "" : form.setup_digitizing_charge}
                onChange={(e) => setForm({ ...form, setup_digitizing_charge: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
              />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="flex justify-between text-sm">
              <span>Calculated Price (stitch-based):</span>
              <span className="font-medium">{formatCurrency(calculatedPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Unit Price ({useManual ? "Manual" : "Calculated"}):</span>
              <span className="font-medium">{formatCurrency(unitPrice)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 text-sm font-bold">
              <span>Line Total ({form.quantity || 0} × {formatCurrency(unitPrice)}):</span>
              <span>{formatCurrency(lineTotal)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>

          {savedItemId && (
            <div className="flex flex-col gap-4 rounded-lg border p-3">
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
      toast.success("Payment recorded")
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
