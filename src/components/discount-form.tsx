import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { logAudit } from "@/lib/audit"
import { fetchConfigItems } from "@/lib/config"
import {
  discountFromAmounts,
  formatCurrency,
  orderGrossTotal,
  orderSubtotal,
  type CostLine,
  type DiscountLine,
} from "@/lib/helpers"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import type { Order, OrderItem } from "@/lib/types"
import { cn } from "@/lib/utils"

/** A discount as typed into the form. An empty value means no discount. */
export interface DiscountDraft {
  type: "amount" | "percent"
  value: string
  reason: string
}

export const EMPTY_DISCOUNT: DiscountDraft = { type: "percent", value: "", reason: "" }

const NO_REASON = "__none__"

export function discountDraftOf(order: Pick<Order, "discount_type" | "discount_value" | "discount_reason">): DiscountDraft {
  if (!order.discount_type || !(Number(order.discount_value) > 0)) return EMPTY_DISCOUNT
  return { type: order.discount_type, value: String(order.discount_value), reason: order.discount_reason || "" }
}

/** What the draft means as a discount; used for live totals while typing. */
export function discountLineOf(draft: DiscountDraft): DiscountLine {
  const value = parseFloat(draft.value)
  return Number.isNaN(value) || value <= 0 ? {} : { discount_type: draft.type, discount_value: value }
}

/** The columns to save. No value clears the discount. */
export function discountColumns(draft: DiscountDraft) {
  const line = discountLineOf(draft)
  if (!line.discount_type) return { discount_type: null, discount_value: 0, discount_reason: null }
  return {
    discount_type: line.discount_type,
    discount_value: Number(line.discount_value),
    discount_reason: draft.reason.trim() || null,
  }
}

/** A message when the draft can't be saved, otherwise null. */
export function discountProblem(draft: DiscountDraft, gross: number): string | null {
  if (draft.value.trim() === "") return null
  const value = parseFloat(draft.value)
  if (Number.isNaN(value) || value < 0) return "Enter the discount as a number"
  if (draft.type === "percent" && value > 100) return "A percentage can't be more than 100"
  if (draft.type === "amount" && gross > 0 && value > gross) {
    return `The discount can't be more than the order (${formatCurrency(gross)})`
  }
  return null
}

/** The configured reasons (config category "discount_reason"). */
export function useDiscountReasons(): string[] {
  const [reasons, setReasons] = React.useState<string[]>([])
  React.useEffect(() => {
    fetchConfigItems("discount_reason").then((items) => setReasons(items.map((i) => i.name)))
  }, [])
  return reasons
}

/** The discount inputs: ₹ or %, the value, a reason, and what it comes to. */
export function DiscountFields({
  draft,
  onChange,
  itemsSubtotal,
  gross,
}: {
  draft: DiscountDraft
  onChange: (draft: DiscountDraft) => void
  /** The order's item prices (what a percentage is taken from). */
  itemsSubtotal: number
  /** The whole order before any discount. */
  gross: number
}) {
  const reasons = useDiscountReasons()
  const line = discountLineOf(draft)
  const taken = discountFromAmounts(line, itemsSubtotal, gross)
  const options = draft.reason && !reasons.includes(draft.reason) ? [draft.reason, ...reasons] : reasons

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border" role="group" aria-label="Discount type">
          {(["percent", "amount"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={draft.type === t}
              onClick={() => onChange({ ...draft, type: t })}
              className={cn(
                "h-9 w-11 text-sm font-medium transition-colors",
                draft.type === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {t === "percent" ? "%" : "₹"}
            </button>
          ))}
        </div>
        <Input
          type="number"
          min={0}
          max={draft.type === "percent" ? 100 : undefined}
          step="0.01"
          inputMode="decimal"
          placeholder={draft.type === "percent" ? "Percentage" : "Amount"}
          value={draft.value}
          onChange={(e) => onChange({ ...draft, value: e.target.value })}
        />
      </div>
      <Select
        value={draft.reason || NO_REASON}
        onValueChange={(v) => onChange({ ...draft, reason: v === NO_REASON ? "" : v })}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Reason (optional)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_REASON}>No reason</SelectItem>
          {options.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {gross > 0 && (
        <p className="text-xs text-muted-foreground">
          {taken > 0
            ? `Takes off ${formatCurrency(taken)} — the total becomes ${formatCurrency(gross - taken)}.`
            : "No discount."}
          {draft.type === "percent" && " A percentage is taken from the item prices only."}
        </p>
      )}
    </div>
  )
}

/** Add, change or remove the discount on an existing order. */
export function DiscountDialog({
  order,
  items,
  extras,
  onClose,
  onSaved,
}: {
  order: Order
  items: OrderItem[]
  extras: CostLine[]
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const [draft, setDraft] = React.useState<DiscountDraft>(() => discountDraftOf(order))
  const [saving, setSaving] = React.useState(false)
  const had = !!order.discount_type

  async function save(next: DiscountDraft) {
    const problem = discountProblem(next, orderGrossTotal(items, extras))
    if (problem) {
      toast.error(problem)
      return
    }
    setSaving(true)
    try {
      const columns = discountColumns(next)
      const { error } = await supabase
        .from("orders")
        .update({ ...columns, updated_by: profile?.id ?? null, updated_at: new Date().toISOString() })
        .eq("id", order.id)
      if (error) throw error
      await logAudit(
        profile,
        "orders",
        order.id,
        "UPDATE",
        { discount_type: order.discount_type, discount_value: order.discount_value, discount_reason: order.discount_reason },
        columns,
      )
      toast.success(columns.discount_type ? "Discount saved" : "Discount removed")
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error("Failed to save the discount")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{had ? "Edit Discount" : "Add Discount"}</DialogTitle>
          <DialogDescription>Order {order.order_number}</DialogDescription>
        </DialogHeader>
        <DiscountFields draft={draft} onChange={setDraft} itemsSubtotal={orderSubtotal(items)} gross={orderGrossTotal(items, extras)} />
        <DialogFooter>
          {had && (
            <Button variant="ghost" disabled={saving} onClick={() => save(EMPTY_DISCOUNT)} className="sm:mr-auto">
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save(draft)} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
