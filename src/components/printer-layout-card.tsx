import * as React from "react"
import { SlidersHorizontal } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getReceiptOptions, onPrinterChange, PAPER_SIZES, updatePrinterOptions, type PaperDots } from "@/lib/printer"

// One line feed on these printers is about 3.75 mm of paper.
const FEED_OPTIONS = [2, 4, 6, 8, 10, 12, 16]
const TOP_OPTIONS = [0, 16, 40, 80]

function Setting({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** How a receipt is laid out and fed. Kept on this device with the printer. */
export function PrinterLayoutCard() {
  const [, bump] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => onPrinterChange(bump), [])
  const o = getReceiptOptions()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" /> Receipt layout
        </CardTitle>
        <CardDescription>How receipts and tags look on paper. Applies to this device only.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Setting label="Paper width">
          <Select value={String(o.paperDots)} onValueChange={(v) => updatePrinterOptions({ paperDots: Number(v) as PaperDots })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAPER_SIZES.map((p) => (
                <SelectItem key={p.dots} value={String(p.dots)}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Setting>

        <Setting label="Border" hint="A frame round the whole receipt.">
          <Switch checked={o.border} onCheckedChange={(border) => updatePrinterOptions({ border })} />
        </Setting>

        <Setting label="Space at the bottom" hint="Blank paper after the receipt, so it clears the cutter.">
          <Select value={String(o.feedLines)} onValueChange={(v) => updatePrinterOptions({ feedLines: Number(v) })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(FEED_OPTIONS.includes(o.feedLines) ? FEED_OPTIONS : [...FEED_OPTIONS, o.feedLines].sort((a, b) => a - b)).map((n) => (
                <SelectItem key={n} value={String(n)}>{`${Math.round(n * 3.75)} mm`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Setting>

        <Setting label="Space at the top" hint="Extra blank paper before the receipt. Usually none.">
          <Select value={String(o.topSpace)} onValueChange={(v) => updatePrinterOptions({ topSpace: Number(v) })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TOP_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>{d === 0 ? "None" : `${d / 8} mm`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Setting>

        <Setting label="Cut paper" hint="Cut after each receipt. Switch off if your printer has no cutter.">
          <Switch checked={o.cut} onCheckedChange={(cut) => updatePrinterOptions({ cut })} />
        </Setting>
      </CardContent>
    </Card>
  )
}
