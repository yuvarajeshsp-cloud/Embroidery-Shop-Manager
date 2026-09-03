import * as React from "react"
import { Download, Plus, Search, Pencil, Trash2, Phone, Mail, MapPin, Archive, ArchiveRestore } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { formatCurrency, formatDate, generateCustomerCode } from "@/lib/helpers"
import type { Customer, Order, OrderItem, Payment } from "@/lib/types"
import type { ExportField } from "@/lib/export"
import { ExportDialog } from "@/components/export-dialog"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Switch } from "@/components/ui/switch"
import { useRouter } from "@/lib/router"
import { fetchConfigItems } from "@/lib/config"
import { toast } from "sonner"
import { orderTotal, orderBalanceDue } from "@/lib/helpers"

export function CustomersPage() {
  const { navigate } = useRouter()
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<Set<string>>(new Set())
  const [customerTypes, setCustomerTypes] = React.useState<string[]>([])
  const [showArchived, setShowArchived] = React.useState(false)
  const [editing, setEditing] = React.useState<Customer | null>(null)
  const [showForm, setShowForm] = React.useState(false)
  const [showExport, setShowExport] = React.useState(false)

  React.useEffect(() => {
    fetchConfigItems("customer_type").then((items) =>
      setCustomerTypes(items.map((i) => i.name)),
    )
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    let query = supabase.from("customers").select("*").order("customer_business_name")
    if (!showArchived) {
      query = query.eq("archived", false)
    }
    const { data, error } = await query
    if (error) {
      toast.error("Failed to load customers")
      console.error(error)
    } else {
      setCustomers(data || [])
    }
    setLoading(false)
  }

  const filtered = customers.filter((c) => {
    const matchesSearch =
      !search ||
      c.customer_business_name.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_code.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_person || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search)
    const matchesType = typeFilter.size === 0 || typeFilter.has(c.customer_type)
    return matchesSearch && matchesType
  })

  const customerExportFields: ExportField<Customer>[] = [
    { key: "customer_code", label: "Customer Code", value: (c) => c.customer_code },
    { key: "customer_business_name", label: "Business Name", value: (c) => c.customer_business_name },
    { key: "contact_person", label: "Contact Person", value: (c) => c.contact_person || "" },
    { key: "phone", label: "Phone", value: (c) => c.phone || "" },
    { key: "whatsapp", label: "WhatsApp", value: (c) => c.whatsapp || "" },
    { key: "email", label: "Email", value: (c) => c.email || "" },
    { key: "customer_type", label: "Customer Type", value: (c) => c.customer_type },
    { key: "gst_tax_number", label: "GST/Tax Number", value: (c) => c.gst_tax_number || "" },
    { key: "billing_address", label: "Billing Address", value: (c) => c.billing_address || "" },
    { key: "delivery_address", label: "Delivery Address", value: (c) => c.delivery_address || "" },
    { key: "date_added", label: "Date Added", value: (c) => formatDate(c.date_added) },
    { key: "notes", label: "Notes", value: (c) => c.notes || "" },
    { key: "archived", label: "Archived", value: (c) => (c.archived ? "Yes" : "No") },
  ]

  function handleNew() {
    setEditing(null)
    setShowForm(true)
  }

  function handleEdit(c: Customer) {
    setEditing(c)
    setShowForm(true)
  }

  async function handleArchive(c: Customer, archive: boolean) {
    const { error } = await supabase
      .from("customers")
      .update({ archived: archive, updated_at: new Date().toISOString() })
      .eq("id", c.id)
    if (error) {
      toast.error("Failed to update customer")
    } else {
      toast.success(archive ? "Customer archived" : "Customer restored")
      loadCustomers()
    }
  }

  async function handleDelete(c: Customer) {
    if (!confirm(`Delete customer "${c.customer_business_name}"? This cannot be undone.`)) return
    const { error } = await supabase.from("customers").delete().eq("id", c.id)
    if (error) {
      toast.error("Cannot delete — customer has linked orders or payments")
    } else {
      toast.success("Customer deleted")
      loadCustomers()
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Customers" description="Manage your customer database">
        <Button variant="outline" onClick={() => setShowExport(true)} size="sm">
          <Download className="size-4" />
          Export
        </Button>
        <Button onClick={handleNew} size="sm">
          <Plus className="size-4" />
          New Customer
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, code, contact, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MultiSelectFilter
          label="Type"
          options={customerTypes.map((t) => ({ value: t, label: t }))}
          selected={typeFilter}
          onChange={setTypeFilter}
        />
        <Button
          variant={showArchived ? "default" : "outline"}
          onClick={() => {
            setShowArchived(!showArchived)
            setTimeout(loadCustomers, 0)
          }}
          size="sm"
        >
          <Archive className="size-4" />
          {showArchived ? "Showing Archived" : "Show Archived"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No customers found. Click "New Customer" to add one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Business Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate({ name: "customer-detail", id: c.id })}>
                    <TableCell className="font-mono text-xs">{c.customer_code}</TableCell>
                    <TableCell className="font-medium">
                      {c.customer_business_name}
                      {c.archived && <Badge variant="secondary" className="ml-2 text-xs">Archived</Badge>}
                    </TableCell>
                    <TableCell>{c.contact_person || "—"}</TableCell>
                    <TableCell>{c.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.customer_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(c)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleArchive(c, !c.archived)}>
                          {c.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(c)}>
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

      {showForm && (
        <CustomerForm
          customer={editing}
          customerTypes={customerTypes}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            loadCustomers()
          }}
        />
      )}

      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        title="Export Customers"
        filename="customers"
        sheetName="Customers"
        rows={filtered}
        fields={customerExportFields}
      />
    </div>
  )
}

function CustomerForm({
  customer,
  customerTypes,
  onClose,
  onSaved,
}: {
  customer: Customer | null
  customerTypes: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    customer_code: customer?.customer_code || "",
    customer_business_name: customer?.customer_business_name || "",
    contact_person: customer?.contact_person || "",
    phone: customer?.phone || "",
    whatsapp: customer?.whatsapp || "",
    email: customer?.email || "",
    billing_address: customer?.billing_address || "",
    delivery_address: customer?.delivery_address || "",
    customer_type: customer?.customer_type || customerTypes[0] || "Retail",
    gst_tax_number: customer?.gst_tax_number || "",
    notes: customer?.notes || "",
    whatsapp_opt_in: customer?.whatsapp_opt_in ?? true,
  })

  React.useEffect(() => {
    if (!customer) {
      generateCustomerCode().then((code) => setForm((f) => ({ ...f, customer_code: code })))
    }
  }, [customer])

  async function handleSave() {
    if (!form.customer_business_name.trim()) {
      toast.error("Business name is required")
      return
    }
    setSaving(true)
    try {
      if (customer) {
        const { error } = await supabase
          .from("customers")
          .update({ ...form, updated_at: new Date().toISOString(), updated_by: profile?.id })
          .eq("id", customer.id)
        if (error) throw error
        await logAudit(profile, "customers", customer.id, "UPDATE", customer as unknown as Record<string, unknown>, form as unknown as Record<string, unknown>)
        toast.success("Customer updated")
      } else {
        let code = form.customer_code
        let data
        for (let attempt = 0; attempt < 2; attempt++) {
          const { data: insertData, error } = await supabase
            .from("customers")
            .insert({ ...form, customer_code: code, created_by: profile?.id, updated_by: profile?.id })
            .select()
            .single()
          if (!error) {
            data = insertData
            break
          }
          if (error.code === "23505" && attempt === 0) {
            code = await generateCustomerCode()
            continue
          }
          throw error
        }
        if (!data) throw new Error("Failed to create customer")
        await logAudit(profile, "customers", data.id, "INSERT", null, { ...form, customer_code: code } as unknown as Record<string, unknown>)
        toast.success("Customer created")
      }
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error("Failed to save customer")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "New Customer"}</DialogTitle>
          <DialogDescription>
            {customer ? "Update customer information" : "Add a new customer to your database"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Customer Code</Label>
              <Input
                value={form.customer_code}
                placeholder={form.customer_code ? undefined : "Generating..."}
                disabled
                readOnly
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Customer Type</Label>
              <Select
                value={form.customer_type}
                onValueChange={(v) => setForm({ ...form, customer_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customerTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Business Name *</Label>
            <Input
              value={form.customer_business_name}
              onChange={(e) => setForm({ ...form, customer_business_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Contact Person</Label>
              <Input
                value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>WhatsApp</Label>
              <Input
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.whatsapp_opt_in}
              onCheckedChange={(v) => setForm({ ...form, whatsapp_opt_in: v })}
            />
            <Label className="font-normal">Send WhatsApp updates to this customer</Label>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Billing Address</Label>
            <Textarea
              value={form.billing_address}
              onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Delivery Address</Label>
            <Textarea
              value={form.delivery_address}
              onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>GST/Tax Number</Label>
            <Input
              value={form.gst_tax_number}
              onChange={(e) => setForm({ ...form, gst_tax_number: e.target.value })}
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

export function CustomerDetailPage({ id }: { id: string }) {
  const { navigate } = useRouter()
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [orders, setOrders] = React.useState<(Order & { order_items?: OrderItem[]; payments?: Payment[] })[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadCustomer()
  }, [id])

  async function loadCustomer() {
    setLoading(true)
    const [custRes, ordersRes, itemsRes, paymentsRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).maybeSingle(),
      supabase.from("orders").select("*").eq("customer_id", id).order("order_date", { ascending: false }),
      supabase.from("order_items").select("*"),
      supabase.from("payments").select("*").eq("customer_id", id),
    ])

    setCustomer(custRes.data as Customer | null)
    const allOrders = ordersRes.data || []
    const allItems = itemsRes.data || []
    const allPayments = paymentsRes.data || []

    const ordersWithDetails = allOrders.map((o: Order) => ({
      ...o,
      order_items: allItems.filter((i: OrderItem) => i.order_id === o.id),
      payments: allPayments.filter((p: Payment) => p.order_id === o.id),
    }))
    setOrders(ordersWithDetails)
    setLoading(false)
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Loading...</div>
  }

  if (!customer) {
    return <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">Customer not found</div>
  }

  const totalOrderValue = orders.reduce((sum, o) => sum + orderTotal(o.order_items || []), 0)
  const totalDue = orders.reduce((sum, o) => sum + orderBalanceDue(o.order_items || [], o.payments || []), 0)

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title={customer.customer_business_name} description={`Customer Code: ${customer.customer_code}`}>
        <Button variant="outline" size="sm" onClick={() => navigate({ name: "customers" })}>
          Back to List
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Customer Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Contact Person</span>
              <span className="text-sm font-medium">{customer.contact_person || "—"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Phone</span>
              <span className="flex items-center gap-1 text-sm">
                <Phone className="size-3.5" />{customer.phone || "—"}
              </span>
            </div>
            {customer.whatsapp && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">WhatsApp</span>
                <span className="text-sm">{customer.whatsapp}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Email</span>
                <span className="flex items-center gap-1 text-sm">
                  <Mail className="size-3.5" />{customer.email}
                </span>
              </div>
            )}
            {customer.billing_address && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Billing Address</span>
                <span className="flex items-start gap-1 text-sm">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />{customer.billing_address}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Type</span>
              <Badge variant="outline" className="w-fit">{customer.customer_type}</Badge>
            </div>
            {customer.gst_tax_number && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">GST Number</span>
                <span className="font-mono text-sm">{customer.gst_tax_number}</span>
              </div>
            )}
            {customer.notes && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Notes</span>
                <span className="text-sm">{customer.notes}</span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Date Added</span>
              <span className="text-sm">{formatDate(customer.date_added)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Total Orders</span>
                <span className="text-xl font-bold">{orders.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Total Value</span>
                <span className="text-xl font-bold">{formatCurrency(totalOrderValue)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Outstanding</span>
                <span className="text-xl font-bold text-amber-600">{formatCurrency(totalDue)}</span>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium">Order History</h4>
              {orders.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No orders yet</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {orders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => navigate({ name: "order-detail", id: o.id })}
                      className="flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{o.order_number}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(o.order_date)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{formatCurrency(orderTotal(o.order_items || []))}</span>
                        <Badge variant="outline">{o.order_status}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
