import * as React from "react"
import { Download, Minus, Plus, RotateCcw, X, ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { getAttachmentUrl } from "@/lib/attachments"
import type { OrderItemAttachment } from "@/lib/types"

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

function isImage(a: OrderItemAttachment) {
  return (a.file_type || "").startsWith("image/")
}

function isPdf(a: OrderItemAttachment) {
  return a.file_type === "application/pdf" || a.file_name.toLowerCase().endsWith(".pdf")
}

export function AttachmentViewerDialog({
  attachment,
  onClose,
}: {
  attachment: OrderItemAttachment | null
  onClose: () => void
}) {
  const [zoom, setZoom] = React.useState(1)

  React.useEffect(() => {
    setZoom(1)
  }, [attachment?.id])

  if (!attachment) return null

  const url = getAttachmentUrl(attachment.file_path)
  const previewable = isImage(attachment) || isPdf(attachment)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[80vh] w-[80vw] max-w-none flex-col gap-0 p-0"
      >
        <DialogHeader className="flex-row items-center justify-between gap-4 border-b px-4 py-3">
          <DialogTitle className="truncate text-sm font-medium">{attachment.file_name}</DialogTitle>
          <div className="flex shrink-0 items-center gap-1">
            {previewable && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={zoom <= MIN_ZOOM}
                  onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
                  title="Zoom out"
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-12 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={zoom >= MAX_ZOOM}
                  onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
                  title="Zoom in"
                >
                  <Plus className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setZoom(1)} title="Reset zoom">
                  <RotateCcw className="size-4" />
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" size="icon-sm" asChild title="Open in new tab">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} title="Close">
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/30">
          {isImage(attachment) ? (
            <div className="flex min-h-full items-center justify-center p-4">
              <img
                src={url}
                alt={attachment.file_name}
                style={{ transform: `scale(${zoom})` }}
                className="max-w-none origin-center transition-transform"
              />
            </div>
          ) : isPdf(attachment) ? (
            <div className="flex size-full items-center justify-center overflow-auto p-4">
              <div
                style={{ transform: `scale(${zoom})` }}
                className="h-[calc(80vh-4.5rem)] w-full origin-top transition-transform"
              >
                <iframe src={url} title={attachment.file_name} className="size-full rounded border-0 bg-white" />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
              <Button asChild>
                <a href={url} target="_blank" rel="noopener noreferrer" download={attachment.file_name}>
                  <Download className="size-4" /> Download {attachment.file_name}
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
