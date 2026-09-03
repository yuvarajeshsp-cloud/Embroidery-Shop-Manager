import * as React from "react"
import { Upload, FileText, X } from "lucide-react"
import { useAuth } from "@/lib/use-auth"
import { AttachmentViewerDialog } from "@/components/attachment-viewer"
import {
  fetchAttachments,
  uploadAttachment,
  deleteAttachment,
  getAttachmentUrl,
} from "@/lib/attachments"
import type { AttachmentCategory, OrderItemAttachment } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"

const ACCEPT = "image/*,.pdf,.doc,.docx"

function isImage(a: OrderItemAttachment) {
  return (a.file_type || "").startsWith("image/")
}

export function AttachmentThumb({
  attachment,
  onView,
  onDelete,
}: {
  attachment: OrderItemAttachment
  onView: () => void
  onDelete?: () => void
}) {
  const url = getAttachmentUrl(attachment.file_path)
  return (
    <div className="group relative flex size-20 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
      <button type="button" onClick={onView} className="flex size-full items-center justify-center">
        {isImage(attachment) ? (
          <img src={url} alt={attachment.file_name} className="size-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 p-1 text-center">
            <FileText className="size-6 text-muted-foreground" />
            <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">{attachment.file_name}</span>
          </div>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-0.5 top-0.5 hidden size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm hover:text-destructive group-hover:flex"
          title="Delete"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

export function AttachmentSection({
  orderItemId,
  category,
  label,
}: {
  orderItemId: string
  category: AttachmentCategory
  label: string
}) {
  const { profile } = useAuth()
  const [attachments, setAttachments] = React.useState<OrderItemAttachment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [uploading, setUploading] = React.useState(false)
  const [viewing, setViewing] = React.useState<OrderItemAttachment | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderItemId, category])

  async function load() {
    setLoading(true)
    const all = await fetchAttachments(orderItemId)
    setAttachments(all.filter((a) => a.category === category))
    setLoading(false)
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment(orderItemId, category, file, profile?.id)
      }
      await load()
    } catch (err) {
      console.error(err)
      toast.error("Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDelete(a: OrderItemAttachment) {
    if (!confirm(`Delete "${a.file_name}"?`)) return
    try {
      await deleteAttachment(a)
      setAttachments((prev) => prev.filter((x) => x.id !== a.id))
    } catch (err) {
      console.error(err)
      toast.error("Failed to delete file")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}
          Add
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No files yet</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <AttachmentThumb key={a.id} attachment={a} onView={() => setViewing(a)} onDelete={() => handleDelete(a)} />
          ))}
        </div>
      )}
      <AttachmentViewerDialog attachment={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
