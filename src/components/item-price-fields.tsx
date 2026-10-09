import { Hash, IndianRupee, Sparkles } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PRICING_MODES, useVocabulary, type PricingMode } from "@/lib/shop-type"

export interface ItemPriceValues {
  pricing_mode: PricingMode
  quantity: number
  stitches_per_unit: number
  rate_per_1000_stitches: number
  /** Kept as text so the field can be empty while typing. */
  manual_unit_price: string
  setup_digitizing_charge: number
}

/** Price of one unit for what is currently typed into the form. */
export function formUnitPrice(v: ItemPriceValues): number {
  if (v.pricing_mode === "stitch") {
    if (v.manual_unit_price !== "") return parseFloat(v.manual_unit_price) || 0
    return ((v.stitches_per_unit || 0) / 1000) * (v.rate_per_1000_stitches || 0)
  }
  return parseFloat(v.manual_unit_price) || 0
}

export function formLineTotal(v: ItemPriceValues): number {
  const qty = v.pricing_mode === "fixed" ? 1 : v.quantity || 0
  return formUnitPrice(v) * qty
}

/** The columns to save for what is typed into the form. */
export function priceColumns(v: ItemPriceValues) {
  const stitch = v.pricing_mode === "stitch"
  return {
    pricing_mode: v.pricing_mode,
    quantity: v.pricing_mode === "fixed" ? 1 : v.quantity || 1,
    stitches_per_unit: stitch ? v.stitches_per_unit || 0 : 0,
    rate_per_1000_stitches: stitch ? v.rate_per_1000_stitches || 0 : 0,
    manual_unit_price: v.manual_unit_price !== "" ? parseFloat(v.manual_unit_price) : null,
    setup_digitizing_charge: v.setup_digitizing_charge || 0,
  }
}

/** Why the price can't be saved yet, or null when it is fine. */
export function priceProblem(v: ItemPriceValues): string | null {
  if (v.pricing_mode !== "stitch" && (v.manual_unit_price === "" || Number.isNaN(parseFloat(v.manual_unit_price)))) {
    return v.pricing_mode === "fixed" ? "Enter the price" : "Enter the price for one unit"
  }
  return null
}

const num = (n: number) => (Number.isNaN(n) ? "" : n)

export function ItemPriceFields({
  values,
  onChange,
}: {
  values: ItemPriceValues
  onChange: (patch: Partial<ItemPriceValues>) => void
}) {
  const vocab = useVocabulary()
  const mode = values.pricing_mode
  const modeInfo = PRICING_MODES.find((m) => m.value === mode)!

  const priceLabel = mode === "metre" ? "Price per metre" : mode === "fixed" ? "Price" : "Price per piece"

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label className="font-normal text-muted-foreground">Priced</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = v as PricingMode
            onChange({ pricing_mode: next, ...(next === "fixed" ? { quantity: 1 } : {}) })
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRICING_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{modeInfo.hint}</p>
      </div>

      {mode === "stitch" ? (
        <>
          <div className="grid grid-cols-3 items-end gap-5">
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
                <Hash className="size-3.5" /> Quantity
              </Label>
              <Input
                type="number"
                min={1}
                value={num(values.quantity)}
                onChange={(e) => onChange({ quantity: e.target.value === "" ? NaN : parseInt(e.target.value, 10) })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
                <Sparkles className="size-3.5" /> Stitches/Unit
              </Label>
              <Input
                type="number"
                min={0}
                value={num(values.stitches_per_unit)}
                onChange={(e) => onChange({ stitches_per_unit: e.target.value === "" ? NaN : parseInt(e.target.value, 10) })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
                <IndianRupee className="size-3.5" /> Rate/1K Stitches
              </Label>
              <Input
                type="number"
                step="0.01"
                value={num(values.rate_per_1000_stitches)}
                onChange={(e) => onChange({ rate_per_1000_stitches: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-5">
            <div className="flex flex-col gap-2">
              <Label className="font-normal text-muted-foreground">Unit Price (Manual)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Auto-calculate"
                value={values.manual_unit_price}
                onChange={(e) => onChange({ manual_unit_price: e.target.value })}
              />
            </div>
            <ExtraCharge label={vocab.setupLabel} values={values} onChange={onChange} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 items-end gap-5">
          {mode !== "fixed" && (
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
                <Hash className="size-3.5" /> {mode === "metre" ? "Metres" : "Quantity"}
              </Label>
              <Input
                type="number"
                min={mode === "metre" ? 0.1 : 1}
                step={mode === "metre" ? "0.1" : "1"}
                value={num(values.quantity)}
                onChange={(e) =>
                  onChange({
                    quantity: e.target.value === "" ? NaN : mode === "metre" ? parseFloat(e.target.value) : parseInt(e.target.value, 10),
                  })
                }
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-1.5 font-normal text-muted-foreground">
              <IndianRupee className="size-3.5" /> {priceLabel}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={values.manual_unit_price}
              onChange={(e) => onChange({ manual_unit_price: e.target.value })}
            />
          </div>
          <ExtraCharge label={vocab.setupLabel} values={values} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

function ExtraCharge({
  label,
  values,
  onChange,
}: {
  label: string
  values: ItemPriceValues
  onChange: (patch: Partial<ItemPriceValues>) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="font-normal text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="0.01"
        value={num(values.setup_digitizing_charge)}
        onChange={(e) => onChange({ setup_digitizing_charge: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
      />
    </div>
  )
}
