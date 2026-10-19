import * as React from "react"
import { Search, Plus, Pencil, Download } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import {
  formatCurrency,
  formatDate,
  generatePaymentNumber,
} from "@/lib/helpers"
import type { Payment, Order, Customer } from "@/lib/types"
import type { ExportField } from "@/lib/export"
import { computeDateRange, isWithinRange, type DateRangePreset } from "@/lib/date-range"
import { OrderInfoButton } from "@/components/info-card"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
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
import { PaymentMethodBadge, PaymentRecordStatusBadge } from "@/components/status-badges"
import { useRouter } from "@/lib/router"
import { useIsMobile } from "@/hooks/use-mobile"
import { fetchConfigItems } from "@/lib/config"
import { toast } from "sonner"
import { notify } from "@/lib/notify"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { DateRangeFilter } from "@/components/date-range-filter"
import { ExportDialog } from "@/components/export-dialog"

const PAYMENT_STATUSES = ["Completed", "Pending", "Reversed", "Refunded"]

type EnrichedPayment = Payment & { order?: Order; customer?: Customer }

export function PaymentsPage() {
  const { navigate } = useRouter()
  const isMobile = useIsMobile()
  const [payments, setPayments] = React.useState<EnrichedPayment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<Set<string>>(new Set())
  const [methodFilter, setMethodFilter] = React.useState<Set<string>>(new Set())
  const [customerFilter, setCustomerFilter] = React.useState<Set<string>>(new Set())
  const [paymentMethods, setPaymentMethods] = React.useState<string[]>([])
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>("all_time")
  const [customFrom, setCustomFrom] = React.useState("")
  const [customTo, setCustomTo] = React.useState("")
  const [showExport, setShowExport] = React.useState(false)
  const [showForm, setShowForm] = React.useState(false)
  const [editing, setEditing] = React.useState<Payment | null>(null)

  React.useEffect(() => {
    fetchConfigItems("payment_method").then((items) => setPaymentMethods(items.map((i) => i.name)))
    loadPayments()
  }, [])

  async function loadPayments() {
    // Reloading after a save keeps the page as it is; the spinner is only for the first load.
    const { data } = await supabase
      .from("payments")
      .select("*")
      .order("payment_date", { ascending: false })

    if (!data) { setLoading(false); return }

    const orderIds = [...new Set(data.map((p: Payment) => p.order_id))]
    const customerIds = [...new Set(data.map((p: Payment) => p.customer_id))]
    const [ordersRes, customersRes] = await Promise.all([
      supabase.from("orders").select("*").in("id", orderIds),
      supabase.from("customers").select("*").in("id", customerIds),
    ])

    const orderMap = new Map((ordersRes.data || []).map((o: Order) => [o.id, o]))
    const customerMap = new Map((customersRes.data || []).map((c: Customer) => [c.id, c]))

    setPayments(
      data.map((p: Payment) => ({
        ...p,
        order: orderMap.get(p.order_id),
        customer: customerMap.get(p.customer_id),
      })),
    )
    setLoading(false)
  }

  const dateRange = computeDateRange(datePreset, customFrom, customTo)

  const customerOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const p of payments) {
      if (p.customer) map.set(p.customer.id, `${p.customer.customer_business_name} (${p.customer.customer_code})`)
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [payments])

  const filtered = payments.filter((p) => {
    const matchesSearch =
      !search ||
      p.payment_number.toLowerCase().includes(search.toLowerCase()) ||
      (p.customer?.customer_business_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.order?.order_number || "").toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter.size === 0 || statusFilter.has(p.payment_status)
    const matchesMethod = methodFilter.size === 0 || methodFilter.has(p.payment_method)
    const matchesCustomer = customerFilter.size === 0 || customerFilter.has(p.customer_id)
    const matchesDate = isWithinRange(p.payment_date, dateRange)
    return matchesSearch && matchesStatus && matchesMethod && matchesCustomer && matchesDate
  })

  const paymentExportFields: ExportField<EnrichedPayment>[] = [
    { key: "payment_number", label: "Payment Number", value: (p) => p.payment_number },
    { key: "payment_date", label: "Payment Date", value: (p) => formatDate(p.payment_date) },
    { key: "order_number", label: "Order Number", value: (p) => p.order?.order_number || "" },
    { key: "customer", label: "Customer", value: (p) => p.customer?.customer_business_name || "" },
    { key: "customer_code", label: "Customer Code", value: (p) => p.customer?.customer_code || "" },
    { key: "payment_method", label: "Payment Method", value: (p) => p.payment_method },
    { key: "amount", label: "Amount", value: (p) => p.amount },
    { key: "payment_status", label: "Status", value: (p) => p.payment_status },
    { key: "transaction_reference", label: "Transaction Reference", value: (p) => p.transaction_reference || "" },
    { key: "notes", label: "Notes", value: (p) => p.notes || "" },
  ]

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Payments" description="Track all customer payments">
        <Button variant="outline" size="sm" onClick={() => setShowExport(true)}>
          <Download className="size-4" /> <span className="hidden sm:inline">Export</span>
        </Button>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Record Payment</span>
          <span className="sm:hidden">Payment</span>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by payment #, customer, order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MultiSelectFilter
          label="Status"
          options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))}
          selected={statusFilter}
          onChange={setStatusFilter}
          className="w-full sm:w-auto"
        />
        <MultiSelectFilter
          label="Method"
          options={paymentMethods.map((m) => ({ value: m, label: m }))}
          selected={methodFilter}
          onChange={setMethodFilter}
          className="w-full sm:w-auto"
        />
        <MultiSelectFilter
          label="Customer"
          options={customerOptions}
          selected={customerFilter}
          onChange={setCustomerFilter}
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
            <div className="p-8 text-center text-muted-foreground">No payments found</div>
          ) : isMobile ? (
            <div className="flex flex-col divide-y">
              {filtered.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm">{p.payment_number}</span>
                    <span className="font-semibold">{formatCurrency(p.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <button
                      className="font-mono text-xs text-primary hover:underline"
                      onClick={() => p.order && navigate({ name: "order-detail", id: p.order.id })}
                    >
                      {p.order?.order_number || "—"}
                    </button>
                    <span>{formatDate(p.payment_date)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{p.customer?.customer_business_name || "—"}</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <PaymentMethodBadge method={p.payment_method} />
                      <PaymentRecordStatusBadge status={p.payment_status} />
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(p); setShowForm(true) }}>
                      <Pencil className="size-3.5" />
                    </Button>
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
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.payment_number}</TableCell>
                    <TableCell className="text-sm">{formatDate(p.payment_date)}</TableCell>
                    <TableCell>
                      <button
                        className="font-mono text-xs text-primary hover:underline"
                        onClick={() => p.order && navigate({ name: "order-detail", id: p.order.id })}
                      >
                        {p.order?.order_number || "—"}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">{p.customer?.customer_business_name || "—"}</TableCell>
                    <TableCell><PaymentMethodBadge method={p.payment_method} /></TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(p.amount)}</TableCell>
                    <TableCell><PaymentRecordStatusBadge status={p.payment_status} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(p); setShowForm(true) }}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <PaymentForm
          payment={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadPayments() }}
        />
      )}

      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        title="Export Payments"
        filename="payments"
        sheetName="Payments"
        rows={filtered}
        fields={paymentExportFields}
      />
    </div>
  )
}

function PaymentForm({
  payment,
  onClose,
  onSaved,
}: {
  payment: Payment | null
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const [saving, setSaving] = React.useState(false)
  const [orders, setOrders] = React.useState<(Order & { customer?: Customer })[]>([])
  const [paymentMethods, setPaymentMethods] = React.useState<string[]>([])
  const [selectedOrderId, setSelectedOrderId] = React.useState(payment?.order_id || "")
  const [form, setForm] = React.useState({
    payment_number: payment?.payment_number || generatePaymentNumber(),
    payment_date: payment?.payment_date || new Date().toISOString().split("T")[0],
    customer_id: payment?.customer_id || "",
    payment_method: payment?.payment_method || "Cash",
    amount: payment?.amount || 0,
    transaction_reference: payment?.transaction_reference || "",
    notes: payment?.notes || "",
    payment_status: payment?.payment_status || "Completed",
  })

  React.useEffect(() => {
    fetchConfigItems("payment_method").then((items) => setPaymentMethods(items.map((i) => i.name)))
    loadOrders()
  }, [])

  async function loadOrders() {
    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .order("order_date", { ascending: false })
    if (!orderData) return
    const customerIds = [...new Set(orderData.map((o: Order) => o.customer_id))]
    const { data: customers } = await supabase.from("customers").select("*").in("id", customerIds)
    const customerMap = new Map((customers || []).map((c: Customer) => [c.id, c]))
    setOrders(orderData.map((o: Order) => ({ ...o, customer: customerMap.get(o.customer_id) })))
  }

  const selectedOrder = orders.find((o) => o.id === selectedOrderId)
  const customerId = form.customer_id || selectedOrder?.customer_id || ""

  async function handleSave() {
    if (!selectedOrderId) {
      toast.error("Please select an order")
      return
    }
    if (!form.amount || form.amount <= 0) {
      toast.error("Amount must be greater than 0")
      return
    }
    setSaving(true)
    try {
      const payload = {
        payment_number: form.payment_number,
        payment_date: form.payment_date,
        order_id: selectedOrderId,
        customer_id: customerId,
        payment_method: form.payment_method,
        amount: form.amount,
        transaction_reference: form.transaction_reference || null,
        notes: form.notes || null,
        payment_status: form.payment_status,
        updated_by: profile?.id,
      }
      if (payment) {
        const { error } = await supabase.from("payments").update(payload).eq("id", payment.id)
        if (error) throw error
        await logAudit(profile, "payments", payment.id, "UPDATE", null, payload as unknown as Record<string, unknown>)
        notify.success("Payment updated")
      } else {
        const { error } = await supabase.from("payments").insert({ ...payload, created_by: profile?.id })
        if (error) throw error
        notify.success("Payment recorded")
      }
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error("Failed to save payment")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{payment ? "Edit Payment" : "Record Payment"}</DialogTitle>
          <DialogDescription>Link a payment to an order</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>Order *</Label>
            <div className="flex items-center gap-1">
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger><SelectValue placeholder="Select order..." /></SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_number} — {o.customer?.customer_business_name || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <OrderInfoButton orderId={selectedOrderId} />
            </div>
          </div>
          {selectedOrder && (
            <div className="rounded-lg border bg-muted/50 p-2 text-xs text-muted-foreground">
              Customer: {selectedOrder.customer?.customer_business_name}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={Number.isNaN(form.amount) ? "" : form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Payment Status</Label>
              <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Reversed">Reversed</SelectItem>
                  <SelectItem value="Refunded">Refunded</SelectItem>
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
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
