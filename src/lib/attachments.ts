import { supabase } from "./supabase"
import type { AttachmentCategory, OrderItemAttachment } from "./types"

const BUCKET = "order-attachments"

export function getAttachmentUrl(filePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl
}

export async function fetchAttachments(orderItemId: string): Promise<OrderItemAttachment[]> {
  const { data, error } = await supabase
    .from("order_item_attachments")
    .select("*")
    .eq("order_item_id", orderItemId)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("Failed to fetch attachments:", error)
    return []
  }
  return data || []
}

export async function fetchAttachmentsForItems(orderItemIds: string[]): Promise<OrderItemAttachment[]> {
  if (orderItemIds.length === 0) return []
  const { data, error } = await supabase
    .from("order_item_attachments")
    .select("*")
    .in("order_item_id", orderItemIds)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("Failed to fetch attachments:", error)
    return []
  }
  return data || []
}

export async function uploadAttachment(
  orderItemId: string,
  category: AttachmentCategory,
  file: File,
  uploadedBy: string | undefined,
): Promise<OrderItemAttachment> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const path = `${orderItemId}/${category}/${Date.now()}-${safeName}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
  })
  if (uploadError) throw uploadError

  const { data, error: insertError } = await supabase
    .from("order_item_attachments")
    .insert({
      order_item_id: orderItemId,
      category,
      file_name: file.name,
      file_path: path,
      file_type: file.type || null,
      file_size: file.size,
      uploaded_by: uploadedBy || null,
    })
    .select()
    .single()

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw insertError
  }

  return data
}

export async function deleteAttachment(attachment: OrderItemAttachment): Promise<void> {
  const { error } = await supabase.from("order_item_attachments").delete().eq("id", attachment.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([attachment.file_path])
}
