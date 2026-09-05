import * as React from "react"
import { ArrowLeft, ArrowRight, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { formatCurrency, generateOrderNumber } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import type { Customer } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useRouter } from "@/lib/router"
import { fetchConfigItems, getDefaultStitchRate } from "@/lib/config"
import { toast } from "sonner"

interface DraftItem {
  tempId: string
  product_type: string
  product_description: string
  design_name_number: string
  size_placement: string
  quantity: number
  stitches_per_unit: number
  rate_per_1000_stitches: number
  manual_unit_price: string
  setup_digitizing_charge: number
  notes: string
}

export function NewOrderPage() {
  const { navigate } = useRouter()
  const { profile } = useAuth()
  const [step, setStep] = React.useState(1)
  const [saving, setSaving] = React.useState(false)
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [customerPickerOpen, setCustomerPickerOpen] = React.useState(false)
  const [orderStatuses, setOrderStatuses] = React.useState<string[]>([])
  const [priorities, setPriorities] = React.useState<string[]>([])
  const [productTypes, setProductTypes] = React.useState<string[]>([])
  const [salesChannels, setSalesChannels] = React.useState<string[]>([])
  const [defaultRate, setDefaultRate] = React.useState(10)

  const [orderForm, setOrderForm] = React.useState({
    order_number: "",
    order_date: new Date().toISOString().split("T")[0],
    customer_id: "",
    required_date: "",
    priority: "Normal",
    order_status: "Quotation",
    customer_po_reference: "",
    sales_channel: "",
    special_instructions: "",
    internal_notes: "",
  })

  const [items, setItems] = React.useState<DraftItem[]>([])

  React.useEffect(() => {
    async function init() {
      const [custRes, statusItems, priorityItems, typeItems, channelItems, rate, orderNumber] = await Promise.all([
        supabase.from("customers").select("*").eq("archived", false).order("customer_business_name"),
        fetchConfigItems("order_status"),
        fetchConfigItems("priority"),
        fetchConfigItems("product_type"),
        fetchConfigItems("sales_channel"),
        getDefaultStitchRate(),
        generateOrderNumber(),
      ])
      setCustomers(custRes.data || [])
      setOrderStatuses(statusItems.map((i) => i.name))
      setPriorities(priorityItems.map((i) => i.name))
      setProductTypes(typeItems.map((i) => i.name))
      setSalesChannels(channelItems.map((i) => i.name))
      setDefaultRate(rate)
      setOrderForm((prev) => ({ ...prev, order_number: orderNumber }))
      setItems([
        {
          tempId: crypto.randomUUID(),
          product_type: typeItems[0]?.name || "Other",
          product_description: "",
          design_name_number: "",
          size_placement: "",
          quantity: 1,
          stitches_per_unit: 0,
          rate_per_1000_stitches: rate,
          manual_unit_price: "",
          setup_digitizing_charge: 0,
          notes: "",
        },
      ])
    }
    init()
  }, [])

  function addBlankItem() {
    setItems((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        product_type: productTypes[0] || "Other",
        product_description: "",
        design_name_number: "",
        size_placement: "",
        quantity: 1,
        stitches_per_unit: 0,
        rate_per_1000_stitches: defaultRate,
        manual_unit_price: "",
        setup_digitizing_charge: 0,
        notes: "",
      },
    ])
  }

  function updateItem(tempId: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)))
  }

  function removeItem(tempId: string) {
    setItems((prev) => prev.filter((i) => i.tempId !== tempId))
  }

  const subtotal = items.reduce((s, i) => {
    const unit = i.manual_unit_price !== ""
      ? parseFloat(i.manual_unit_price)
      : ((i.stitches_per_unit || 0) / 1000) * (i.rate_per_1000_stitches || 0)
    return s + unit * (i.quantity || 0)
  }, 0)
  const setup = items.reduce((s, i) => s + (i.setup_digitizing_charge || 0), 0)
  const grandTotal = subtotal + setup

  async function handleSave() {
    if (!orderForm.customer_id) {
      toast.error("Please select a customer")
      setStep(1)
      return
    }
    if (items.length === 0) {
      toast.error("Please add at least one item")
      setStep(2)
      return
    }
    setSaving(true)
    try {
      let orderNumber = orderForm.order_number
      let orderData
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error: orderError } = await supabase
          .from("orders")
          .insert({
            order_number: orderNumber,
            order_date: orderForm.order_date,
            customer_id: orderForm.customer_id,
            required_date: orderForm.required_date || null,
            priority: orderForm.priority,
            order_status: orderForm.order_status,
            customer_po_reference: orderForm.customer_po_reference || null,
            sales_channel: orderForm.sales_channel || null,
            special_instructions: orderForm.special_instructions || null,
            internal_notes: orderForm.internal_notes || null,
            created_by: profile?.id,
            updated_by: profile?.id,
          })
          .select()
          .single()

        if (!orderError) {
          orderData = data
          break
        }
        if (orderError.code === "23505" && attempt === 0) {
          orderNumber = await generateOrderNumber()
          continue
        }
        throw orderError
      }
      if (!orderData) throw new Error("Failed to create order")
      setOrderForm((prev) => ({ ...prev, order_number: orderNumber }))

      const itemPayloads = items.map((item, idx) => ({
        order_id: orderData.id,
        item_number: idx + 1,
        product_type: item.product_type,
        product_description: item.product_description || null,
        design_name_number: item.design_name_number || null,
        size_placement: item.size_placement || null,
        quantity: item.quantity || 1,
        stitches_per_unit: item.stitches_per_unit || 0,
        rate_per_1000_stitches: item.rate_per_1000_stitches || 0,
        manual_unit_price: item.manual_unit_price !== "" ? parseFloat(item.manual_unit_price) : null,
        setup_digitizing_charge: item.setup_digitizing_charge || 0,
        notes: item.notes || null,
      }))

      const { error: itemsError } = await supabase.from("order_items").insert(itemPayloads)
      if (itemsError) throw itemsError

      await logAudit(profile, "orders", orderData.id, "INSERT", null, { order_number: orderNumber } as Record<string, unknown>)
      toast.success("Order created successfully")
      navigate({ name: "order-detail", id: orderData.id })
    } catch (err) {
      console.error(err)
      toast.error("Failed to create order")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="New Order" description="Create a new embroidery order">
        <Button variant="outline" size="sm" onClick={() => navigate({ name: "orders" })}>
          Cancel
        </Button>
      </PageHeader>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: "Order Details" },
          { n: 2, label: "Items & Pricing" },
          { n: 3, label: "Review & Save" },
        ].map((s) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                step >= s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {s.n}
            </div>
            <span className={`text-sm ${step >= s.n ? "font-medium" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {s.n < 3 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Order Details */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Order Number</Label>
                <Input
                  value={orderForm.order_number}
                  placeholder={orderForm.order_number ? undefined : "Generating..."}
                  disabled={!orderForm.order_number}
                  onChange={(e) => setOrderForm({ ...orderForm, order_number: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Order Date</Label>
                <Input
                  type="date"
                  value={orderForm.order_date}
                  onChange={(e) => setOrderForm({ ...orderForm, order_date: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Customer *</Label>
              <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerPickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    {orderForm.customer_id
                      ? (() => {
                          const c = customers.find((c) => c.id === orderForm.customer_id)
                          return c ? `${c.customer_business_name} (${c.customer_code})` : "Select customer..."
                        })()
                      : <span className="text-muted-foreground">Select customer...</span>}
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search customers..." />
                    <CommandList>
                      <CommandEmpty>No customer found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.customer_business_name} ${c.customer_code}`}
                            onSelect={() => {
                              setOrderForm({ ...orderForm, customer_id: c.id })
                              setCustomerPickerOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 size-4",
                                orderForm.customer_id === c.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {c.customer_business_name} ({c.customer_code})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Delivery Date</Label>
                <Input
                  type="date"
                  value={orderForm.required_date}
                  onChange={(e) => setOrderForm({ ...orderForm, required_date: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Priority</Label>
                <Select
                  value={orderForm.priority}
                  onValueChange={(v) => setOrderForm({ ...orderForm, priority: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Order Status</Label>
                <Select
                  value={orderForm.order_status}
                  onValueChange={(v) => setOrderForm({ ...orderForm, order_status: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {orderStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Customer PO Reference</Label>
                <Input
                  value={orderForm.customer_po_reference}
                  onChange={(e) => setOrderForm({ ...orderForm, customer_po_reference: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Sales Channel</Label>
              <Select
                value={orderForm.sales_channel}
                onValueChange={(v) => setOrderForm({ ...orderForm, sales_channel: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select sales channel..." /></SelectTrigger>
                <SelectContent>
                  {salesChannels.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Special Instructions</Label>
              <Textarea
                value={orderForm.special_instructions}
                onChange={(e) => setOrderForm({ ...orderForm, special_instructions: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Internal Notes</Label>
              <Textarea
                value={orderForm.internal_notes}
                onChange={(e) => setOrderForm({ ...orderForm, internal_notes: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>
                Next: Add Items <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Items */}
      {step === 2 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Items & Pricing</CardTitle>
            <Button size="sm" onClick={addBlankItem}>
              <Plus className="size-4" /> Add Item
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No items added yet. Click "Add Item" to add embroidery items.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {items.map((item, idx) => {
                  const calcPrice = ((item.stitches_per_unit || 0) / 1000) * (item.rate_per_1000_stitches || 0)
                  const useManual = item.manual_unit_price !== ""
                  const unitPrice = useManual ? parseFloat(item.manual_unit_price) : calcPrice
                  const lineTotal = unitPrice * (item.quantity || 0)
                  return (
                    <div key={item.tempId} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-medium">Item {idx + 1}</span>
                        <Button variant="ghost" size="icon-sm" onClick={() => removeItem(item.tempId)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Product Type</Label>
                          <Select
                            value={item.product_type}
                            onValueChange={(v) => updateItem(item.tempId, { product_type: v })}
                          >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {productTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Design Name/No.</Label>
                          <Input
                            className="h-8"
                            value={item.design_name_number}
                            onChange={(e) => updateItem(item.tempId, { design_name_number: e.target.value })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Size/Placement</Label>
                          <Input
                            className="h-8"
                            value={item.size_placement}
                            onChange={(e) => updateItem(item.tempId, { size_placement: e.target.value })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Quantity</Label>
                          <Input
                            type="number"
                            min={1}
                            className="h-8"
                            value={Number.isNaN(item.quantity) ? "" : item.quantity}
                            onChange={(e) => updateItem(item.tempId, { quantity: e.target.value === "" ? NaN : parseInt(e.target.value, 10) })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Stitches/Unit</Label>
                          <Input
                            type="number"
                            min={0}
                            className="h-8"
                            value={Number.isNaN(item.stitches_per_unit) ? "" : item.stitches_per_unit}
                            onChange={(e) => updateItem(item.tempId, { stitches_per_unit: e.target.value === "" ? NaN : parseInt(e.target.value, 10) })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Rate/1K Stitches</Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8"
                            value={Number.isNaN(item.rate_per_1000_stitches) ? "" : item.rate_per_1000_stitches}
                            onChange={(e) => updateItem(item.tempId, { rate_per_1000_stitches: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Manual Unit Price</Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8"
                            placeholder="Auto"
                            value={item.manual_unit_price}
                            onChange={(e) => updateItem(item.tempId, { manual_unit_price: e.target.value })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Setup/Digitizing</Label>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8"
                            value={Number.isNaN(item.setup_digitizing_charge) ? "" : item.setup_digitizing_charge}
                            onChange={(e) => updateItem(item.tempId, { setup_digitizing_charge: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Line Total</Label>
                          <div className="flex h-8 items-center font-medium">{formatCurrency(lineTotal)}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-col gap-1">
                        <Label className="text-xs">Description</Label>
                        <Textarea
                          className="min-h-0"
                          rows={1}
                          value={item.product_description}
                          onChange={(e) => updateItem(item.tempId, { product_description: e.target.value })}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Review <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Review & Save</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Order Number</span>
                <span className="font-mono text-sm">{orderForm.order_number}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Customer</span>
                <span className="text-sm font-medium">
                  {customers.find((c) => c.id === orderForm.customer_id)?.customer_business_name || "—"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Order Date</span>
                <span className="text-sm">{orderForm.order_date}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Delivery Date</span>
                <span className="text-sm">{orderForm.required_date || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Priority</span>
                <span className="text-sm">{orderForm.priority}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Status</span>
                <span className="text-sm">{orderForm.order_status}</span>
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="border-b p-3 text-sm font-medium">Items ({items.length})</div>
              <div className="flex flex-col gap-2 p-3">
                {items.map((item, idx) => {
                  const calcPrice = ((item.stitches_per_unit || 0) / 1000) * (item.rate_per_1000_stitches || 0)
                  const useManual = item.manual_unit_price !== ""
                  const unitPrice = useManual ? parseFloat(item.manual_unit_price) : calcPrice
                  const lineTotal = unitPrice * (item.quantity || 0)
                  return (
                    <div key={item.tempId} className="flex items-center justify-between text-sm">
                      <span>{idx + 1}. {item.product_type} — {item.product_description || item.design_name_number || "—"}</span>
                      <span className="font-medium">{formatCurrency(lineTotal)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border bg-muted/50 p-3">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Setup/Digitizing</span><span>{formatCurrency(setup)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-sm font-bold">
                <span>Total</span><span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Create Order"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
