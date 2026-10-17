import * as React from "react"
import { Printer, Bluetooth, Usb } from "lucide-react"
import { toast } from "sonner"
import { notify } from "@/lib/notify"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  const native = kinds.includes("native-ble")
  const options: { kind: PrinterKind; title: string; help: string; unsupported: string }[] = native
    ? [
        {
          kind: "native-ble",
          title: "Bluetooth",
          help: "Searches for nearby Bluetooth Low Energy printers.",
          unsupported: "",
        },
      ]
    : [
        {
          kind: "usb",
          title: "USB cable",
          help: "A printer plugged into this computer.",
          unsupported: "This browser can't use USB printers. Open the app in Chrome or Edge on a computer.",
        },
        {
          kind: "serial",
          title: "Paired Bluetooth printer",
          help: "A printer already paired in this computer's Bluetooth settings (most 80 mm printers).",
          unsupported: "This browser can't use paired printers. Open the app in Chrome or Edge on a computer.",
        },
        {
          kind: "web-ble",
          title: "Bluetooth Low Energy",
          help: "Searches for nearby Low Energy printers. Older printers won't be listed — use the paired option instead.",
          unsupported: "This browser has no Bluetooth access. Chrome and Edge have it; Safari and Firefox don't.",
        },
      ]

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      notify.success(success)
    } catch (err) {
      const { message, hint } = explain(err)
      if (message !== "No printer was chosen") toast.error(message, { description: hint, duration: 9000 })
    } finally {
      setBusy(false)
    }
  }

  const kindIcon = (k: PrinterKind) => (k === "usb" ? <Usb className="size-4 shrink-0" /> : <Bluetooth className="size-4 shrink-0" />)

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

        {kinds.length === 0 && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            This browser (for example Firefox or Safari) can't connect to a printer directly. Receipts will open the normal
            print window instead — pick your receipt printer there. For direct printing use Chrome or Edge on a computer,
            or the Android / iPhone app.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {options.map((o) => {
            const supported = kinds.includes(o.kind)
            const current = settings?.kind === o.kind && !!settings.name
            return (
              <div key={o.kind} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {kindIcon(o.kind)} {o.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{supported ? o.help : o.unsupported}</span>
                </div>
                <Button
                  size="sm"
                  variant={current ? "outline" : "default"}
                  disabled={busy || !supported}
                  onClick={() => run(() => pairPrinter(o.kind), "Printer connected")}
                  className="shrink-0"
                >
                  {current ? "Choose another" : "Choose printer"}
                </Button>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => run(() => printTestPage(), "Test page sent")}>
            Print test page
          </Button>
          {settings?.name && (
            <Button variant="ghost" disabled={busy} onClick={() => run(forgetPrinter, "Printer removed from this device")}>
              Forget printer
            </Button>
          )}
        </div>

        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Computer: first pair a Bluetooth printer in the computer's own Bluetooth settings (PIN is usually 0000 or 1234), then choose "Paired Bluetooth printer" here and pick its port.</li>
          <li>Phone app: turn the printer on and keep it close; choose it from here, not from the phone's Bluetooth settings. iPhone works only with Bluetooth Low Energy printers.</li>
          <li>USB: on Windows the printer may need its driver switched to WinUSB once.</li>
        </ul>
      </CardContent>
    </Card>
  )
}
