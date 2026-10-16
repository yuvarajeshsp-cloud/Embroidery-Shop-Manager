import * as React from "react"
import { FileDown, Printer } from "lucide-react"
import { toast } from "sonner"
import { Capacitor } from "@capacitor/core"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageLoader } from "@/components/app-loader"
import { generateOrderPdf, getPdfFileName, printPdfBlob, savePdfBlob, type OrderPdfData } from "@/lib/pdf"

/** Draws each page of a PDF to an image — the phone apps' web views can't show a PDF inline. */
async function renderPages(blob: Blob): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist")
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 1.6 })
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    pages.push(canvas.toDataURL("image/jpeg", 0.85))
  }
  return pages
}

/**
 * One popup for the invoice PDF: shows the document and offers Download and
 * Print, at the top and again at the bottom.
 */
export function PdfPreviewDialog({ data, onClose }: { data: OrderPdfData; onClose: () => void }) {
  const [blob, setBlob] = React.useState<Blob | null>(null)
  const [url, setUrl] = React.useState<string | null>(null)
  const [pages, setPages] = React.useState<string[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const native = Capacitor.isNativePlatform()
  const title = `Invoice ${data.order.order_number}`

  React.useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    generateOrderPdf(data)
      .then(async (b) => {
        if (cancelled) return
        setBlob(b)
        if (native) {
          const imgs = await renderPages(b)
          if (!cancelled) setPages(imgs)
        } else {
          objectUrl = URL.createObjectURL(b)
          setUrl(objectUrl)
        }
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(action: () => Promise<void>, error: string, success?: string) {
    if (!blob) return
    try {
      await action()
      if (success) toast.success(success)
    } catch (err) {
      console.error(err)
      if (err instanceof Error && /cancel|abort|dismiss/i.test(err.message)) return
      toast.error(error)
    }
  }

  const fileName = getPdfFileName(data.order)
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={!blob}
        onClick={() => run(() => savePdfBlob(blob!, fileName, title), "Couldn't save the PDF", native ? undefined : "PDF downloaded")}
      >
        <FileDown className="size-4" /> {native ? "Save / Share" : "Download"}
      </Button>
      <Button disabled={!blob} onClick={() => run(() => printPdfBlob(blob!, fileName, title), "Couldn't open the PDF")}>
        <Printer className="size-4" /> Print
      </Button>
    </div>
  )

  const ready = native ? !!pages : !!url

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Full invoice PDF.</DialogDescription>
        </DialogHeader>

        {actions}

        <div className="rounded-lg bg-muted/60 p-3">
          {failed ? (
            <p className="p-6 text-center text-sm text-muted-foreground">The PDF couldn't be prepared. Close this and try again.</p>
          ) : !ready ? (
            <PageLoader size="sm" />
          ) : native ? (
            <div className="flex flex-col gap-3">
              {pages!.map((src, i) => (
                <img key={i} src={src} alt={`Page ${i + 1}`} className="block w-full bg-white shadow-md" />
              ))}
            </div>
          ) : (
            <iframe title={title} src={url!} className="block h-[60vh] w-full rounded bg-white" />
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
