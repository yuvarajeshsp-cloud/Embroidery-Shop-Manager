import * as React from "react"
import { Printer } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageLoader } from "@/components/app-loader"
import {
  currentPaperDots,
  PAPER_SIZES,
  printBlocks,
  PrinterError,
  renderReceiptPreview,
  setPaperWidth,
  type PaperDots,
  type ReceiptBlock,
} from "@/lib/printer"

/**
 * One popup for a receipt: shows exactly what will come out of the printer and
 * prints it. The Print button is at the top and again at the bottom so it is
 * in reach however far the receipt is scrolled.
 */
export function ReceiptPrintDialog({
  title,
  description,
  load,
  onClose,
  onBrowserPrint,
}: {
  title: string
  description?: string
  /** Builds the receipt's content; called once when the popup opens. */
  load: () => Promise<ReceiptBlock[]>
  onClose: () => void
  /** Offered when the thermal printer can't be used. */
  onBrowserPrint?: () => void
}) {
  const [blocks, setBlocks] = React.useState<ReceiptBlock[] | null>(null)
  const [preview, setPreview] = React.useState<{ url: string; width: number; height: number } | null>(null)
  const [paper, setPaper] = React.useState<PaperDots>(currentPaperDots())
  const [printing, setPrinting] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    load()
      .then((b) => !cancelled && setBlocks(b))
      .catch((err) => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (!blocks) return
    let cancelled = false
    renderReceiptPreview(blocks)
      .then((p) => !cancelled && setPreview(p))
      .catch((err) => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [blocks, paper])

  async function handlePrint() {
    if (!blocks) return
    setPrinting(true)
    try {
      await printBlocks(blocks)
      toast.success("Sent to the printer")
    } catch (err) {
      console.error(err)
      if (err instanceof PrinterError && err.message === "No printer was chosen") return
      toast.error(err instanceof Error ? err.message : "Printing failed", {
        description: err instanceof PrinterError ? err.hint : undefined,
        duration: 9000,
        action: onBrowserPrint ? { label: "Print with browser", onClick: onBrowserPrint } : undefined,
      })
    } finally {
      setPrinting(false)
    }
  }

  const printButton = (
    <Button onClick={handlePrint} disabled={!preview || printing}>
      <Printer className="size-4" />
      {printing ? "Printing…" : "Print"}
    </Button>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? "This is what will print."}</DialogDescription>
        </DialogHeader>

        {/* Top: print + paper size */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {printButton}
          <Select
            value={String(paper)}
            onValueChange={(v) => {
              const dots = Number(v) as PaperDots
              setPaperWidth(dots)
              setPaper(dots)
              setPreview(null)
            }}
          >
            <SelectTrigger className="w-44" aria-label="Paper size"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAPER_SIZES.map((p) => (
                <SelectItem key={p.dots} value={String(p.dots)}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg bg-muted/60 p-3">
          {failed ? (
            <p className="p-6 text-center text-sm text-muted-foreground">The receipt couldn't be prepared. Close this and try again.</p>
          ) : !preview ? (
            <PageLoader size="sm" />
          ) : (
            <img
              src={preview.url}
              alt={title}
              className="mx-auto block w-full bg-white shadow-md"
              style={{ maxWidth: Math.round(preview.width * 0.72) }}
            />
          )}
        </div>

        {/* Bottom: the same print button, plus close */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {printButton}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
