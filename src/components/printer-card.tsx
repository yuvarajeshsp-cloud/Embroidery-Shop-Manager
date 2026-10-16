import * as React from "react"
import { Printer, Bluetooth, Usb } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  availableKinds,
  forgetPrinter,
  getPrinterSettings,
  isPrinterConnected,
  kindLabel,
  onPrinterChange,
  pairPrinter,
  PrinterError,
  printTestPage,
  PAPER_SIZES,
  setPaperWidth,
  type PaperDots,
  type PrinterKind,
} from "@/lib/printer"

function usePrinterState() {
  const [, bump] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => onPrinterChange(bump), [])
  return { settings: getPrinterSettings(), connected: isPrinterConnected() }
}

function explain(err: unknown): { message: string; hint?: string } {
  if (err instanceof PrinterError) return { message: err.message, hint: err.hint }
  return { message: err instanceof Error ? err.message : "Something went wrong" }
}

export function PrinterCard() {
  const { settings, connected } = usePrinterState()
  const [busy, setBusy] = React.useState(false)
  const kinds = availableKinds()

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
    } catch (err) {
      const { message, hint } = explain(err)
      if (message !== "No printer was chosen") toast.error(message, { description: hint, duration: 9000 })
    } finally {
      setBusy(false)
    }
  }

  const kindIcon = (k: PrinterKind) => (k === "usb" ? <Usb className="size-4" /> : <Bluetooth className="size-4" />)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="size-4" /> Receipt Printer
        </CardTitle>
        <CardDescription>
          Print Invoice and Print Order Tag go straight to this thermal printer. The setting is kept on this device only.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5 rounded-lg border p-3 text-sm">
          {settings?.name ? (
            <>
              <span className="font-medium">{settings.name}</span>
              <span className="text-xs text-muted-foreground">
                {kindLabel(settings.kind)} · {connected ? "connected" : "will reconnect when you print"}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No printer chosen on this device yet.</span>
          )}
        </div>

        {kinds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This browser can't connect to a printer directly. Use Chrome or Edge on a computer, or the Android or iPhone
            app. "Print with browser" in the order page still works with any printer installed on the computer.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <Button key={k} variant={settings?.kind === k ? "outline" : "default"} disabled={busy} onClick={() => run(() => pairPrinter(k), "Printer connected")}>
                {kindIcon(k)} {settings?.kind === k ? "Choose another" : `Choose printer (${kindLabel(k)})`}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Paper width</span>
          <Select value={String(settings?.paperDots ?? 576)} onValueChange={(v) => setPaperWidth(Number(v) as PaperDots)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAPER_SIZES.map((p) => (
                <SelectItem key={p.dots} value={String(p.dots)}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || kinds.length === 0} onClick={() => run(() => printTestPage(), "Test page sent")}>
            Print test page
          </Button>
          {settings?.name && (
            <Button variant="ghost" disabled={busy} onClick={() => run(forgetPrinter, "Printer removed from this device")}>
              Forget printer
            </Button>
          )}
        </div>

        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Bluetooth: turn the printer on and keep it close. Pair from here, not from the phone's Bluetooth settings.</li>
          <li>iPhone works only with Bluetooth Low Energy (BLE) printers. Android also needs a BLE-capable printer for now.</li>
          <li>USB: use Chrome or Edge on the computer. On Windows the printer may need its driver switched to WinUSB once.</li>
        </ul>
      </CardContent>
    </Card>
  )
}
