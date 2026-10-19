import * as React from "react"
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, ChevronsUpDown, Plus, Trash2, X } from "lucide-react"
import { isOnline } from "@/lib/offline/connectivity"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { discountFromAmounts, discountLabel, formatCurrency, generateOrderNumber } from "@/lib/helpers"
import { uploadAttachment } from "@/lib/attachments"
import { cn } from "@/lib/utils"
import type { Customer, UserProfile } from "@/lib/types"
import { ASSIGNABLE_ROLES } from "@/lib/permissions"
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
import { notify } from "@/lib/notify"
import { CostTypeField, useCostTypes } from "@/components/additional-cost-form"
import { DiscountFields, EMPTY_DISCOUNT, discountColumns, discountLineOf, discountProblem, type DiscountDraft } from "@/components/discount-form"
import { ItemPriceFields, formLineTotal, priceColumns, priceProblem, type ItemPriceValues } from "@/components/item-price-fields"
import { defaultPricingMode, useShopType, useVocabulary, type PricingMode } from "@/lib/shop-type"

interface DraftCost {
  tempId: string
  cost_type: string
  amount: string
}

interface DraftItem {
  tempId: string
  costs: DraftCost[]
  product_type: string
  product_description: string
  design_name_number: string
  size_placement: string
  /** null = whatever is the default for this kind of shop. */
  pricing_mode: PricingMode | null
  quantity: number
  stitches_per_unit: number
  rate_per_1000_stitches: number
  manual_unit_price: string
  setup_digitizing_charge: number
  notes: string
  /** Pictures of the customer's material or the design, sent up after the order is saved. */
  photos: { id: string; file: File; url: string }[]
}

export function NewOrderPage() {
  const { navigate } = useRouter()
  const { profile } = useAuth()
  const shopType = useShopType()
  const vocab = useVocabulary()
  const shopTypeRef = React.useRef(shopType)
  shopTypeRef.current = shopType
  const modeOf = (item: DraftItem): PricingMode => item.pricing_mode ?? defaultPricingMode(shopType)
  const priceValuesOf = (item: DraftItem): ItemPriceValues => ({ ...item, pricing_mode: modeOf(item) })
  const [step, setStep] = React.useState(1)
  const [discount, setDiscount] = React.useState<DiscountDraft>(EMPTY_DISCOUNT)
  const [saving, setSaving] = React.useState(false)
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [assignableUsers, setAssignableUsers] = React.useState<UserProfile[]>([])
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
    trial_date: "",
    material_received: "",
    priority: "Normal",
    order_status: "Quotation",
    sales_channel: "",
    special_instructions: "",
    assigned_to: "",
  })

  const [items, setItems] = React.useState<DraftItem[]>([])
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const costTypes = useCostTypes()
  const itemsRef = React.useRef<DraftItem[]>(items)
  itemsRef.current = items

  React.useEffect(() => {
    return () => {
      itemsRef.current.forEach((i) => i.photos.forEach((p) => URL.revokeObjectURL(p.url)))
    }
  }, [])

  React.useEffect(() => {
    async function init() {
      const [custRes, usersRes, statusItems, priorityItems, typeItems, channelItems, rate, orderNumber] = await Promise.all([
        supabase.from("customers").select("*").eq("archived", false).order("customer_business_name"),
        supabase.from("user_profiles").select("*").in("role", ASSIGNABLE_ROLES).eq("is_active", true).order("display_name"),
        fetchConfigItems("order_status"),
        fetchConfigItems("priority"),
        fetchConfigItems("product_type"),
        fetchConfigItems("sales_channel"),
        getDefaultStitchRate(),
        generateOrderNumber(),
      ])
      setCustomers(custRes.data || [])
      setAssignableUsers(usersRes.data || [])
      setOrderStatuses(statusItems.map((i) => i.name))
      setPriorities(priorityItems.map((i) => i.name))
      setProductTypes(typeItems.map((i) => i.name))
      setSalesChannels(channelItems.map((i) => i.name))
      setDefaultRate(rate)
      const statusNames = statusItems.map((i) => i.name)
      const preferred = shopTypeRef.current === "embroidery" ? "Quotation" : statusNames[0]
      setOrderForm((prev) => ({
        ...prev,
        order_number: orderNumber,
        order_status: statusNames.includes(preferred) ? preferred : statusNames[0] || prev.order_status,
      }))
      const firstItemId = crypto.randomUUID()
      setExpanded(new Set([firstItemId]))
      setItems([
        {
          tempId: firstItemId,
          costs: [],
          product_type: typeItems[0]?.name || "Other",
          product_description: "",
          design_name_number: "",
          size_placement: "",
          pricing_mode: null,
          quantity: 1,
          stitches_per_unit: 0,
          rate_per_1000_stitches: rate,
          manual_unit_price: "",
          setup_digitizing_charge: 0,
          notes: "",
          photos: [],
        },
      ])
    }
    init()
  }, [])

  function addBlankItem() {
    const id = crypto.randomUUID()
    // A new item opens; the others fold away so the page stays short.
    setExpanded(new Set([id]))
    setItems((prev) => [
      ...prev,
      {
        tempId: id,
        costs: [],
        product_type: productTypes[0] || "Other",
        product_description: "",
        design_name_number: "",
        size_placement: "",
        pricing_mode: null,
        quantity: 1,
        stitches_per_unit: 0,
        rate_per_1000_stitches: defaultRate,
        manual_unit_price: "",
        setup_digitizing_charge: 0,
        notes: "",
        photos: [],
      },
    ])
  }

  const itemCostsTotal = (item: DraftItem) => item.costs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
  const itemTotal = (item: DraftItem) =>
    formLineTotal(priceValuesOf(item)) + (item.setup_digitizing_charge || 0) + itemCostsTotal(item)
  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function setItemCosts(id: string, update: (costs: DraftCost[]) => DraftCost[]) {
    setItems((prev) => prev.map((i) => (i.tempId === id ? { ...i, costs: update(i.costs) } : i)))
  }

  function updateItem(tempId: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)))
  }

  function removeItem(tempId: string) {
    setItems((prev) => {
      prev.find((i) => i.tempId === tempId)?.photos.forEach((p) => URL.revokeObjectURL(p.url))
      return prev.filter((i) => i.tempId !== tempId)
    })
  }

  const MAX_PHOTOS = 6

  function addItemPhotos(tempId: string, files: FileList | null) {
    const picked = Array.from(files || []).filter((f) => f.type.startsWith("image/"))
    if (picked.length === 0) return
    setItems((prev) =>
      prev.map((i) => {
        if (i.tempId !== tempId) return i
        const room = Math.max(0, MAX_PHOTOS - i.photos.length)
        if (picked.length > room) toast.error(`Up to ${MAX_PHOTOS} photos per item`)
        const added = picked.slice(0, room).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))
        return { ...i, photos: [...i.photos, ...added] }
      }),
    )
  }

  function removeItemPhoto(tempId: string, photoId: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.tempId !== tempId) return i
        i.photos.filter((p) => p.id === photoId).forEach((p) => URL.revokeObjectURL(p.url))
        return { ...i, photos: i.photos.filter((p) => p.id !== photoId) }
      }),
    )
  }

  const subtotal = items.reduce((s, i) => s + formLineTotal(priceValuesOf(i)), 0)
  const setup = items.reduce((s, i) => s + (i.setup_digitizing_charge || 0), 0)
  const costsTotal = items.reduce((s, i) => s + itemCostsTotal(i), 0)
  const grossTotal = subtotal + setup + costsTotal
  const discountAmount = discountFromAmounts(discountLineOf(discount), subtotal, grossTotal)
  const grandTotal = Math.round((grossTotal - discountAmount) * 100) / 100

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
    for (const [idx, item] of items.entries()) {
      for (const c of item.costs) {
        if (!c.cost_type.trim() || Number.isNaN(parseFloat(c.amount)) || parseFloat(c.amount) < 0) {
          toast.error(`Item ${idx + 1}: choose a type and enter the amount for each additional cost`)
          setStep(2)
          setExpanded((prev) => new Set(prev).add(item.tempId))
          return
        }
      }
    }
    for (const [idx, item] of items.entries()) {
      const problem = priceProblem(priceValuesOf(item))
      if (problem) {
        toast.error(`Item ${idx + 1}: ${problem}`)
        setStep(2)
        return
      }
    }
    const discountIssue = discountProblem(discount, grossTotal)
    if (discountIssue) {
      toast.error(discountIssue)
      setStep(3)
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
            trial_date: orderForm.trial_date || null,
            material_received: orderForm.material_received.trim() || null,
            priority: orderForm.priority,
            order_status: orderForm.order_status,
            sales_channel: orderForm.sales_channel || null,
            special_instructions: orderForm.special_instructions || null,
            assigned_to: orderForm.assigned_to || null,
            // Only sent when there is a discount, so orders without one don't depend on the columns.
            ...(discountLineOf(discount).discount_type ? discountColumns(discount) : {}),
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
        ...priceColumns(priceValuesOf(item)),
        notes: item.notes || null,
      }))

      const { data: insertedItems, error: itemsError } = await supabase
        .from("order_items")
        .insert(itemPayloads)
        .select()
      if (itemsError) throw itemsError

      const costRows = items.flatMap((item, idx) =>
        item.costs.map((c) => ({
          order_id: orderData.id,
          order_item_id: insertedItems?.[idx]?.id,
          cost_type: c.cost_type.trim(),
          amount: parseFloat(c.amount),
          created_by: profile?.id ?? null,
        })),
      )
      if (costRows.length > 0) {
        const { error: costsError } = await supabase.from("order_additional_costs").insert(costRows)
        if (costsError) {
          console.error(costsError)
          toast.error("Order created, but the additional costs could not be saved — add them on the order")
        }
      }

      const photosToUpload = items
        .flatMap((item, idx) => item.photos.map((p) => ({ file: p.file, orderItemId: insertedItems?.[idx]?.id })))
        .filter((p): p is { file: File; orderItemId: string } => !!p.orderItemId)
      if (photosToUpload.length > 0 && !isOnline()) {
        // Pictures go to online storage, so they can't be sent from here with no connection.
        toast.info("The order is saved. Its photos need internet — add them from the order's item once you're back online.")
      } else if (photosToUpload.length > 0) {
        const results = await Promise.allSettled(
          photosToUpload.map((p) => uploadAttachment(p.orderItemId, "material", p.file, profile?.id)),
        )
        if (results.some((r) => r.status === "rejected")) {
          toast.error("Order created, but some photos failed to upload")
        }
      }

      await logAudit(profile, "orders", orderData.id, "INSERT", null, { order_number: orderNumber } as Record<string, unknown>)
      notify.success("Order created successfully")
      navigate({ name: "order-detail", id: orderData.id })
    } catch (err) {
      console.error(err)
      toast.error("Failed to create order")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="New Order" description="Create a new embroidery order">
        <Button variant="outline" size="sm" onClick={() => navigate({ name: "orders" })}>
          Cancel
        </Button>
      </PageHeader>

      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {[
          { n: 1, label: "Details" },
          { n: 2, label: "Items & Pricing" },
          { n: 3, label: "Review" },
        ].map((st) => (
          <div key={st.n} className="flex shrink-0 items-center gap-2">
            <div
              className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                step >= st.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {st.n}
            </div>
            <span className={`text-sm ${step >= st.n ? "font-medium" : "text-muted-foreground"} ${step === st.n ? "" : "hidden sm:inline"}`}>{st.label}</span>
            {st.n < 3 && <div className="h-px w-6 bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Order Details */}
      {step === 1 && (
        <Card className="gap-3 py-4">
          <CardContent className="flex flex-col gap-3 px-4">
            {/* Order number + customer share a row */}
            <div className="grid grid-cols-[6.5rem_1fr] gap-3">
              <Field label="Order No.">
                <Input
                  className="h-9"
                  value={orderForm.order_number}
                  placeholder={orderForm.order_number ? undefined : "…"}
                  disabled
                  readOnly
                />
              </Field>
              <Field label="Customer *">
                <Popover open={customerPickerOpen} onOpenChange={setCustomerPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerPickerOpen}
                      className="h-9 w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {orderForm.customer_id ? (
                          (() => {
                            const c = customers.find((c) => c.id === orderForm.customer_id)
                            return c ? `${c.customer_business_name} (${c.customer_code})` : "Select customer..."
                          })()
                        ) : (
                          <span className="text-muted-foreground">Select customer...</span>
                        )}
                      </span>
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
                                className={cn("mr-2 size-4", orderForm.customer_id === c.id ? "opacity-100" : "opacity-0")}
                              />
                              {c.customer_business_name} ({c.customer_code})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
            </div>

            {/* Dates */}
            <div className={cn("grid gap-3", vocab.usesTrialDate ? "grid-cols-3" : "grid-cols-2")}>
              <Field label="Order Date">
                <Input
                  type="date"
                  className="h-9 min-w-0 px-1.5 text-xs"
                  value={orderForm.order_date}
                  onChange={(e) => setOrderForm({ ...orderForm, order_date: e.target.value })}
                />
              </Field>
              <Field label="Delivery Date">
                <Input
                  type="date"
                  className="h-9 min-w-0 px-1.5 text-xs"
                  value={orderForm.required_date}
                  onChange={(e) => setOrderForm({ ...orderForm, required_date: e.target.value })}
                />
              </Field>
              {vocab.usesTrialDate && (
                <Field label="Trial / Fitting">
                  <Input
                    type="date"
                    className="h-9 min-w-0 px-1.5 text-xs"
                    value={orderForm.trial_date}
                    onChange={(e) => setOrderForm({ ...orderForm, trial_date: e.target.value })}
                  />
                </Field>
              )}
            </div>

            {/* Status, priority, assignee, channel — two to a row */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select value={orderForm.order_status} onValueChange={(v) => setOrderForm({ ...orderForm, order_status: v })}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {orderStatuses.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={orderForm.priority} onValueChange={(v) => setOrderForm({ ...orderForm, priority: v })}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Assign To">
                <Select
                  value={orderForm.assigned_to || "unassigned"}
                  onValueChange={(v) => setOrderForm({ ...orderForm, assigned_to: v === "unassigned" ? "" : v })}
                >
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.display_name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sales Channel">
                <Select value={orderForm.sales_channel} onValueChange={(v) => setOrderForm({ ...orderForm, sales_channel: v })}>
                  <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {salesChannels.map((ch) => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {vocab.usesMaterialReceived && (
              <Field label="Material / Fabric Received">
                <Input
                  className="h-9"
                  placeholder="e.g. 2.5 m cotton, lining, buttons"
                  value={orderForm.material_received}
                  onChange={(e) => setOrderForm({ ...orderForm, material_received: e.target.value })}
                />
              </Field>
            )}

            <Field label="Special Instructions">
              <Textarea
                className="min-h-0"
                value={orderForm.special_instructions}
                onChange={(e) => setOrderForm({ ...orderForm, special_instructions: e.target.value })}
                rows={2}
              />
            </Field>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>
                Next: Items <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Items — each one folds open and shut */}
      {step === 2 && (
        <Card className="gap-3 py-4">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-4">
            <CardTitle>Items & Pricing</CardTitle>
            <div className="flex items-center gap-2">
              {items.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setExpanded(expanded.size > 0 ? new Set() : new Set(items.map((i) => i.tempId)))
                  }
                >
                  {expanded.size > 0 ? "Collapse all" : "Expand all"}
                </Button>
              )}
              <Button size="sm" onClick={addBlankItem}>
                <Plus className="size-4" /> Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-4">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No items added yet. Click "Add Item" to add the first one.
              </p>
            ) : (
              items.map((item, idx) => {
                const values = priceValuesOf(item)
                const isOpen = expanded.has(item.tempId)
                const qty = values.pricing_mode === "fixed" ? "Fixed" : `${item.quantity || 0}${values.pricing_mode === "metre" ? " m" : ""}`
                return (
                  <div key={item.tempId} className="rounded-lg border">
                    {/* Header: always visible; tap to fold */}
                    <div className="flex items-center gap-1 pr-1">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(item.tempId)}
                        aria-expanded={isOpen}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left"
                      >
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
                        <span className="shrink-0 text-xs text-muted-foreground">#{idx + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {item.product_type}
                          {item.product_description && (
                            <span className="font-normal text-muted-foreground"> — {item.product_description}</span>
                          )}
                        </span>
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          {qty}
                          {item.costs.length > 0 && ` · +${item.costs.length} cost${item.costs.length > 1 ? "s" : ""}`}
                        </span>
                        <span className="shrink-0 text-sm font-semibold">{formatCurrency(itemTotal(item))}</span>
                      </button>
                      <Button variant="ghost" size="icon-sm" onClick={() => removeItem(item.tempId)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    {isOpen && (
                      <div className="flex flex-col gap-3 border-t p-3">
                        {/* Type + description on one row, photo beside them */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[12rem_1fr]">
                          <Field label={vocab.productLabel}>
                            <Select value={item.product_type} onValueChange={(v) => updateItem(item.tempId, { product_type: v })}>
                              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {productTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Description">
                            <Input
                              className="h-9"
                              value={item.product_description}
                              onChange={(e) => updateItem(item.tempId, { product_description: e.target.value })}
                            />
                          </Field>
                        </div>

                        <Field label="Photos (optional)">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.photos.map((p) => (
                              <div key={p.id} className="relative size-16 shrink-0 overflow-hidden rounded-md border">
                                <img src={p.url} alt="" className="size-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeItemPhoto(item.tempId, p.id)}
                                  className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-destructive"
                                  title="Remove photo"
                                >
                                  <X className="size-2.5" />
                                </button>
                              </div>
                            ))}
                            {item.photos.length < MAX_PHOTOS && (
                              <label className="flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-muted/50">
                                <Camera className="size-4" />
                                <span className="text-[10px]">Add photos</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    addItemPhotos(item.tempId, e.target.files)
                                    e.target.value = ""
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </Field>

                        <ItemPriceFields values={values} onChange={(patch) => updateItem(item.tempId, patch)} />

                        {/* Additional costs for this item: one row each */}
                        <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Additional costs</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() =>
                                setItemCosts(item.tempId, (cs) => [
                                  ...cs,
                                  { tempId: crypto.randomUUID(), cost_type: "", amount: "" },
                                ])
                              }
                            >
                              <Plus className="size-3.5" /> Add
                            </Button>
                          </div>
                          {item.costs.map((c) => (
                            <div key={c.tempId} className="flex items-center gap-2">
                              <CostTypeField
                                types={costTypes}
                                value={c.cost_type}
                                onChange={(v) =>
                                  setItemCosts(item.tempId, (cs) => cs.map((x) => (x.tempId === c.tempId ? { ...x, cost_type: v } : x)))
                                }
                              />
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                placeholder="Amount"
                                className="h-9 w-28 shrink-0"
                                value={c.amount}
                                onChange={(e) =>
                                  setItemCosts(item.tempId, (cs) => cs.map((x) => (x.tempId === c.tempId ? { ...x, amount: e.target.value } : x)))
                                }
                              />
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="shrink-0"
                                onClick={() => setItemCosts(item.tempId, (cs) => cs.filter((x) => x.tempId !== c.tempId))}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Item total</span>
                          <span className="font-semibold">{formatCurrency(itemTotal(item))}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}

            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
              <span className="font-semibold">Total {formatCurrency(grandTotal)}</span>
            </div>

            <div className="flex justify-between pt-1">
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
        <Card className="gap-3 py-4">
          <CardContent className="flex flex-col gap-3 px-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <Summary label="Order No." value={orderForm.order_number} mono />
              <Summary
                label="Customer"
                value={customers.find((c) => c.id === orderForm.customer_id)?.customer_business_name || "—"}
              />
              <Summary label="Status" value={orderForm.order_status} />
              <Summary label="Order Date" value={orderForm.order_date} />
              <Summary label="Delivery" value={orderForm.required_date || "—"} />
              {vocab.usesTrialDate && <Summary label="Trial / Fitting" value={orderForm.trial_date || "—"} />}
              <Summary label="Priority" value={orderForm.priority} />
              {orderForm.assigned_to && (
                <Summary
                  label="Assigned"
                  value={assignableUsers.find((u) => u.id === orderForm.assigned_to)?.display_name || "—"}
                />
              )}
              {orderForm.material_received && <Summary label="Material" value={orderForm.material_received} />}
            </div>

            <div className="rounded-lg border">
              <div className="flex flex-col divide-y">
                {items.map((item, idx) => {
                  const label = item.product_description || item.design_name_number
                  return (
                    <div key={item.tempId} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {idx + 1}. {item.product_type}
                          {label ? ` — ${label}` : ""}
                        </span>
                        <span className="shrink-0 font-medium">{formatCurrency(formLineTotal(priceValuesOf(item)))}</span>
                      </div>
                      {(item.setup_digitizing_charge || 0) > 0 && (
                        <div className="flex justify-between pl-4 text-xs text-muted-foreground">
                          <span>{vocab.setupLabel.replace(/\s*\(.*\)$/, "")}</span>
                          <span>{formatCurrency(item.setup_digitizing_charge || 0)}</span>
                        </div>
                      )}
                      {item.costs.map((c) => (
                        <div key={c.tempId} className="flex justify-between pl-4 text-xs text-muted-foreground">
                          <span>{c.cost_type || "Additional cost"}</span>
                          <span>{formatCurrency(parseFloat(c.amount) || 0)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-col gap-2 border-t px-3 py-3">
                <span className="text-sm font-medium">Discount <span className="font-normal text-muted-foreground">(optional)</span></span>
                <DiscountFields draft={discount} onChange={setDiscount} itemsSubtotal={subtotal} gross={grossTotal} />
              </div>
              <div className="flex flex-col gap-0.5 border-t bg-muted/50 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {setup > 0 && (
                  <div className="flex justify-between">
                    <span>{vocab.setupLabel.replace(/\s*\(.*\)$/, "")}</span>
                    <span>{formatCurrency(setup)}</span>
                  </div>
                )}
                {costsTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Additional costs</span>
                    <span>{formatCurrency(costsTotal)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>Discount ({discountLabel(discountLineOf(discount))})</span>
                    <span>−{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
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

/** A label above a control; the unit of the compact order form. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label className="truncate text-xs font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function Summary({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("truncate text-sm", mono && "font-mono")}>{value}</span>
    </div>
  )
}
