import { supabase } from "./supabase"
import type { UserProfile } from "./types"

export async function logAudit(
  user: UserProfile | null,
  tableName: string,
  recordId: string,
  action: string,
  previousValues: Record<string, unknown> | null = null,
  newValues: Record<string, unknown> | null = null,
  reason: string | null = null,
) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: user?.id ?? null,
      user_name: user?.display_name ?? "System",
      table_name: tableName,
      record_id: recordId,
      action,
      previous_values: previousValues,
      new_values: newValues,
      reason,
    })
  } catch (err) {
    console.error("Failed to write audit log:", err)
  }
}
