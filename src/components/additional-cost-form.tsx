import * as React from "react"
import { ChevronDown } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchConfigItems } from "@/lib/config"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import type { OrderAdditionalCost } from "@/lib/types"

const CUSTOM = "__custom__"

/** The configured cost types (config category "additional_cost_type"). */
export function useCostTypes(): string[] {
  const [types, setTypes] = React.useState<string[]>([])
  React.useEffect(() => {
    fetchConfigItems("additional_cost_type").then((items) => setTypes(items.map((i) => i.name)))
  }, [])
  return types
}

/**
 * A cost type: pick one of the shop's configured types, or choose "Custom…"
 * and type any text for this order.
 */
export function CostTypeField({
  types,
  value,
  onChange,
}: {
  types: string[]
  value: string
  onChange: (value: string) => void
}) {
  const [custom, setCustom] = React.useState(() => value !== "" && !types.includes(value))

  // A saved cost whose type has since been removed from the list stays editable.
  React.useEffect(() => {
    if (value !== "" && types.length > 0 && !types.includes(value)) setCustom(true)
  }, [types, value])

  if (custom) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Input
          autoFocus={value === ""}
          placeholder="Type the cost"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Choose from the list"
          className="shrink-0"
          onClick={() => {
            setCustom(false)
            onChange("")
          }}
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1">
      <Select
        value={value || undefined}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true)
            onChange("")
          } else {
            onChange(v)
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Cost type…" />
        </SelectTrigger>
        <SelectContent>
          {types.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

export function AdditionalCostForm({
  orderId,
  orderItemId,
  cost,
  onClose,
  onSaved,
}: {
  orderId: string
  orderItemId: string
  cost: OrderAdditionalCost | null
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const types = useCostTypes()
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    cost_type: cost?.cost_type || "",
    amount: cost ? String(cost.amount) : "",
  })

  async function handleSave() {
    const costType = form.cost_type.trim()
    const amount = parseFloat(form.amount)
    if (!costType) {
      toast.error("Choose a cost type or type one in")
      return
    }
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter the amount")
      return
    }
    setSaving(true)
    try {
      const payload = {
        cost_type: costType,
        amount,
      }
      const { error } = cost
        ? await supabase
            .from("order_additional_costs")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", cost.id)
        : await supabase
            .from("order_additional_costs")
            .insert({ ...payload, order_id: orderId, order_item_id: orderItemId, created_by: profile?.id ?? null })
      if (error) throw error
      toast.success(cost ? "Cost updated" : "Cost added")
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error("Failed to save the cost")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cost ? "Edit Additional Cost" : "Add Additional Cost"}</DialogTitle>
          <DialogDescription>Added to this item and to the order total.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <CostTypeField types={types} value={form.cost_type} onChange={(v) => setForm({ ...form, cost_type: v })} />
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="Amount"
            className="w-28 shrink-0"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
