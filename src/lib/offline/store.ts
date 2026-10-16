import {
  idbAll,
  idbByIndex,
  idbClearAll,
  idbDelete,
  idbDeleteMany,
  idbGet,
  idbPut,
  idbPutMany,
  idbReplaceByIndex,
} from "./idb"
import type { Row } from "./query"

// What this device keeps for offline use, scoped to the signed-in person so a
// second account on the same phone never sees the first one's data.

let user: string | null = null
let org: string | null = null

export function currentOfflineUser(): string | null {
  return user
}

export function currentOfflineOrg(): string | null {
  return org
}

export function setOfflineOrg(orgId: string | null) {
  org = orgId
}

/** Rows are normally keyed by `id`; business settings by shop + setting name. */
export function rowKey(table: string, row: Row): string | null {
  if (table === "business_settings") return row.key != null ? `${row.organization_id ?? ""}|${row.key}` : null
  return row.id != null ? String(row.id) : null
}

interface Stored {
  k: string
  t: string
  row: Row
}

const tableId = (table: string) => `${user ?? "-"}|${table}`

export async function loadRows(table: string): Promise<Row[]> {
  const stored = await idbByIndex<Stored>("rows", "t", tableId(table))
  return stored.map((s) => s.row)
}

export async function saveRows(table: string, rows: Row[], opts: { replace: boolean; seen?: boolean }) {
  const t = tableId(table)
  const stored: Stored[] = []
  for (const row of rows) {
    const key = rowKey(table, row)
    if (key) stored.push({ k: `${t}|${key}`, t, row })
  }
  if (opts.replace) await idbReplaceByIndex("rows", "t", t, stored)
  else await idbPutMany("rows", stored)
  if (opts.seen) await idbPut("meta", { k: `seen|${t}`, v: true })
}

export async function removeRows(table: string, rows: Row[]) {
  const t = tableId(table)
  const keys = rows.map((r) => rowKey(table, r)).filter((k): k is string => !!k).map((k) => `${t}|${k}`)
  await idbDeleteMany("rows", keys)
}

export async function tableSeen(table: string): Promise<boolean> {
  return !!(await idbGet<{ v: boolean }>("meta", `seen|${tableId(table)}`))?.v
}

// ---- cached responses (selects that saved rows can't answer) ---------------

export interface CachedResponse {
  k: string
  status: number
  headers: [string, string][]
  body: string
}

export const cacheKey = (url: string, accept: string | null) => `${user ?? "-"}|${accept ?? ""}|${url}`

export const getCachedResponse = (key: string) => idbGet<CachedResponse>("urls", key)
export const putCachedResponse = (value: CachedResponse) => idbPut("urls", value)

// ---- changes waiting to be sent ---------------------------------------------

export interface QueuedOp {
  seq?: number
  user: string | null
  table: string
  method: "POST" | "PATCH" | "DELETE"
  /** Path and query, relative to the server address. */
  path: string
  headers: Record<string, string>
  body: string | null
  at: number
  error?: string
}

export async function enqueue(op: Omit<QueuedOp, "seq">): Promise<void> {
  await idbPut("queue", op)
}

export async function queuedOps(): Promise<QueuedOp[]> {
  const all = await idbAll<QueuedOp>("queue")
  return all.filter((o) => o.user === user).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export const updateQueued = (op: QueuedOp) => idbPut("queue", op)
export const dropQueued = (seq: number) => idbDelete("queue", seq)

export async function failedOps(): Promise<QueuedOp[]> {
  const all = await idbAll<QueuedOp>("failed")
  return all.filter((o) => o.user === user).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

export async function markFailed(op: QueuedOp, error: string) {
  await idbPut("failed", { ...op, error })
  if (op.seq != null) await idbDelete("queue", op.seq)
}

export async function retryFailed() {
  const failed = await failedOps()
  await Promise.all(
    failed.map(async (op) => {
      const { error: _error, ...rest } = op
      void _error
      await idbPut("queue", rest)
      if (op.seq != null) await idbDelete("failed", op.seq)
    }),
  )
}

export async function discardFailed() {
  const failed = await failedOps()
  await idbDeleteMany("failed", failed.map((o) => o.seq!).filter((s) => s != null))
}

// ---- who the saved data belongs to -------------------------------------------

/**
 * Sets whose data is being kept. A different person (or a sign-out) wipes
 * everything first, including any unsent changes — those belong to the other
 * account and must never be sent under this one.
 */
export async function setOfflineUser(next: string | null): Promise<void> {
  if (next === user) return
  const stored = (await idbGet<{ v: string | null }>("meta", "scope"))?.v ?? null
  user = next
  if (next !== null && stored !== null && stored !== next) await idbClearAll()
  if (next !== null && stored !== next) await idbPut("meta", { k: "scope", v: next })
}

export async function wipeOfflineData(): Promise<void> {
  user = null
  org = null
  await idbClearAll()
}
