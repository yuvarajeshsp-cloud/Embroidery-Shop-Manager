import { idbAvailable } from "./idb"
import { isOnline, onConnectivityChange, reportNetworkFailure } from "./connectivity"
import { matches, parseQuery, runQuery, type ParsedQuery, type Row } from "./query"
import {
  cacheKey,
  currentOfflineOrg,
  currentOfflineUser,
  dropQueued,
  enqueue,
  failedOps,
  getCachedResponse,
  loadRows,
  markFailed,
  putCachedResponse,
  queuedOps,
  removeRows,
  rowKey,
  saveRows,
  tableSeen,
  updateQueued,
  type QueuedOp,
} from "./store"
import { getSyncState, patchSyncState } from "./state"
import { noteSave } from "@/lib/notify"

// Sits between the app and Supabase. Reads are answered from the network and
// remembered; with no connection they are answered from what was remembered.
// Changes made with no connection are applied to the remembered rows straight
// away (so the app behaves normally) and queued, then sent in order when the
// connection comes back.

const REST = "/rest/v1/"
const READ_RPCS = new Set(["organization_access_level", "is_platform_admin"])
const READ_TIMEOUT_MS = 15000

let supabaseUrl = ""
let anonKey = ""
let tokenProvider: () => Promise<string | null> = async () => null
let storageOk: Promise<boolean> | null = null

export function configureOffline(opts: { url: string; anonKey: string; token: () => Promise<string | null> }) {
  supabaseUrl = opts.url
  anonKey = opts.anonKey
  tokenProvider = opts.token
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })

const isNetworkError = (err: unknown) =>
  err instanceof TypeError || (err instanceof DOMException && err.name === "TimeoutError")

function wantsObject(headers: Headers) {
  return !!headers.get("accept")?.includes("vnd.pgrst.object")
}

function carriesUserToken(headers: Headers) {
  const auth = headers.get("authorization")
  return !!auth && auth !== `Bearer ${anonKey}`
}

// ---- reading ---------------------------------------------------------------

async function readLocally(url: URL, method: string, headers: Headers): Promise<Response> {
  const q = parseQuery(url)
  if (!q.hasEmbed && (await tableSeen(q.table))) {
    const all = await loadRows(q.table)
    const { rows, total } = runQuery(all, q, headers.get("range"))
    const counted = (headers.get("prefer") ?? "").includes("count=")
    const range: Record<string, string> = counted ? { "content-range": rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}` } : {}
    if (method === "HEAD") return new Response(null, { status: 200, headers: range })
    if (wantsObject(headers)) {
      if (rows.length !== 1) {
        return json(406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" })
      }
      return json(200, rows[0], range)
    }
    return json(200, rows, range)
  }
  const hit = await getCachedResponse(cacheKey(url.href, headers.get("accept")))
  if (hit) return new Response(method === "HEAD" ? null : hit.body, { status: hit.status, headers: hit.headers })
  throw new TypeError("Failed to fetch")
}

async function remember(url: URL, headers: Headers, res: Response) {
  if (!carriesUserToken(headers)) return // an anonymous answer says nothing about this person's data
  const q = parseQuery(url)
  const body = await res.clone().text()
  const exact = q.hasEmbed || !!q.columns
  if (exact || !q.table) {
    await putCachedResponse({ k: cacheKey(url.href, headers.get("accept")), status: res.status, headers: [...res.headers.entries()], body })
  }
  if (exact) return
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return
  }
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).filter((r): r is Row => !!r && typeof r === "object")
  const wholeTable = Array.isArray(parsed) && !q.filtered && q.limit == null && q.offset == null && !url.searchParams.has("offset")
  if (rows.length === 0 && !wholeTable) return
  await saveRows(q.table, rows, { replace: wholeTable, seen: true })
}

async function networkRead(input: RequestInfo | URL, init: RequestInit | undefined, base: typeof fetch): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), READ_TIMEOUT_MS)
  const outer = init?.signal
  if (outer) outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true })
  try {
    return await base(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---- writing -----------------------------------------------------------------

function projectRows(rows: Row[], q: ParsedQuery): Row[] {
  const cols = q.columns
  return cols ? rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) : rows
}

function writeResponse(status: number, rows: Row[], url: URL, headers: Headers): Response {
  const prefer = headers.get("prefer") ?? ""
  if (!prefer.includes("return=representation")) return new Response(null, { status: status === 200 ? 204 : status })
  const shaped = projectRows(rows, parseQuery(url))
  if (wantsObject(headers)) {
    return shaped.length === 1 ? json(status, shaped[0]) : json(406, { code: "PGRST116", details: `The result contains ${shaped.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" })
  }
  return json(status, shaped)
}

/** Fills in what the database would have: a key, timestamps, the shop. */
function localDefaults(sample: Row | undefined, table: string): Row {
  const now = new Date().toISOString()
  const out: Row = {}
  if (!sample) return out
  if ("created_at" in sample) out.created_at = now
  if ("updated_at" in sample) out.updated_at = now
  const org = currentOfflineOrg()
  if (org && "organization_id" in sample && table !== "organizations") out.organization_id = org
  return out
}

async function applyWrite(method: string, url: URL, body: unknown, response: Row[] | null, ids: { generate: boolean }): Promise<{ rows: Row[]; body: unknown }> {
  const q = parseQuery(url)
  const table = q.table
  const existing = await loadRows(table)
  if (method === "POST") {
    const input = (Array.isArray(body) ? body : [body]) as Row[]
    const conflict = url.searchParams.get("on_conflict")?.split(",").filter(Boolean)
    const touched: Row[] = []
    const outBody: Row[] = []
    for (const item of input) {
      const row: Row = { ...item }
      if (ids.generate && table !== "business_settings" && row.id == null) row.id = crypto.randomUUID()
      outBody.push(row)
      const match = existing.find((e) =>
        conflict?.length ? conflict.every((c) => e[c] === row[c]) : rowKey(table, e) !== null && rowKey(table, e) === rowKey(table, row),
      )
      const local: Row = match ? { ...match, ...row } : { ...localDefaults(existing[0], table), ...row }
      touched.push(local)
    }
    await saveRows(table, touched, { replace: false })
    return { rows: response ?? touched, body: Array.isArray(body) ? outBody : outBody[0] }
  }
  if (method === "PATCH") {
    const hit = existing.filter((r) => matches(r, q))
    const now = "updated_at" in (existing[0] ?? {}) ? { updated_at: new Date().toISOString() } : {}
    const updated = hit.map((r) => ({ ...r, ...now, ...(body as Row) }))
    await saveRows(table, response ?? updated, { replace: false })
    return { rows: response ?? updated, body }
  }
  const hit = existing.filter((r) => matches(r, q))
  await removeRows(table, hit)
  return { rows: hit, body: null }
}

async function writeOffline(method: "POST" | "PATCH" | "DELETE", url: URL, headers: Headers, bodyText: string | null): Promise<Response> {
  const body = bodyText ? JSON.parse(bodyText) : null
  const { rows, body: sendBody } = await applyWrite(method, url, body, null, { generate: true })
  const kept: Record<string, string> = {}
  for (const name of ["prefer", "content-type", "accept-profile", "content-profile"]) {
    const v = headers.get(name)
    if (v) kept[name] = v
  }
  await enqueue({
    user: currentOfflineUser(),
    table: parseQuery(url).table,
    method,
    path: `${url.pathname}${url.search}`,
    headers: kept,
    body: sendBody == null ? null : JSON.stringify(sendBody),
    at: Date.now(),
  })
  await refreshCounts()
  noteSave(parseQuery(url).table, method, { queued: true, upsert: (headers.get("prefer") ?? "").includes("resolution=") })
  return writeResponse(method === "POST" ? 201 : 200, rows, url, headers)
}

async function writeOnline(input: RequestInfo | URL, init: RequestInit | undefined, base: typeof fetch, method: string, url: URL, headers: Headers): Promise<Response> {
  const res = await base(input, init)
  if (res.ok) {
    noteSave(parseQuery(url).table, method as "POST" | "PATCH" | "DELETE", { upsert: (headers.get("prefer") ?? "").includes("resolution=") })
    try {
      const prefer = headers.get("prefer") ?? ""
      const bodyText = typeof init?.body === "string" ? init.body : null
      const returned = prefer.includes("return=representation") ? await res.clone().json().catch(() => null) : null
      const rows = returned == null ? null : ((Array.isArray(returned) ? returned : [returned]) as Row[])
      // Without a returned copy a new row has no key we can save it under;
      // it is picked up the next time its list is loaded.
      if (method !== "POST" || rows) {
        await applyWrite(method, url, bodyText ? JSON.parse(bodyText) : null, rows, { generate: false })
      }
    } catch {
      // The saved copy is a convenience; never fail a write that succeeded.
    }
  }
  return res
}

// ---- the fetch the app uses -----------------------------------------------------

export function createOfflineFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase()
    if (!href.startsWith(supabaseUrl + REST) || !(await (storageOk ??= idbAvailable()))) {
      // Sign-in, files and server functions go straight through, but a network
      // failure there still tells us the connection is gone.
      try {
        return await base(input, init)
      } catch (err) {
        if (href.startsWith(supabaseUrl) && isNetworkError(err)) reportNetworkFailure()
        throw err
      }
    }

    const url = new URL(href)
    const headers = new Headers(init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined))
    const isRpc = url.pathname.startsWith(REST + "rpc/")

    if (isRpc) {
      const name = url.pathname.slice((REST + "rpc/").length)
      if (!READ_RPCS.has(name)) return base(input, init)
      const key = cacheKey(`${href}|${typeof init?.body === "string" ? init.body : ""}`, null)
      if (!isOnline()) {
        const hit = await getCachedResponse(key)
        if (hit) return new Response(hit.body, { status: hit.status, headers: hit.headers })
        return base(input, init)
      }
      try {
        const res = await networkRead(input, init, base)
        if (res.ok && carriesUserToken(headers)) {
          void putCachedResponse({ k: key, status: res.status, headers: [...res.headers.entries()], body: await res.clone().text() })
        }
        return res
      } catch (err) {
        if (!isNetworkError(err)) throw err
        reportNetworkFailure()
        const hit = await getCachedResponse(key)
        if (hit) return new Response(hit.body, { status: hit.status, headers: hit.headers })
        throw err
      }
    }

    if (method === "GET" || method === "HEAD") {
      if (!isOnline()) return readLocally(url, method, headers)
      try {
        const res = await networkRead(input, init, base)
        if (res.ok) void remember(url, headers, res).catch(() => {})
        return res
      } catch (err) {
        if (!isNetworkError(err)) throw err
        reportNetworkFailure()
        return readLocally(url, method, headers)
      }
    }

    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      const bodyText = typeof init?.body === "string" ? init.body : null
      const waiting = getSyncState().pending > 0
      // Behind unsent changes, or with no connection: queue, to keep the order.
      if (!isOnline() || waiting) {
        const res = await writeOffline(method, url, headers, bodyText)
        if (isOnline()) void flushQueue()
        return res
      }
      try {
        return await writeOnline(input, init, base, method, url, headers)
      } catch (err) {
        if (!isNetworkError(err)) throw err
        reportNetworkFailure()
        return writeOffline(method, url, headers, bodyText)
      }
    }
    return base(input, init)
  }
}

// ---- sending the queue -------------------------------------------------------------

export async function refreshCounts() {
  const [q, f] = await Promise.all([queuedOps(), failedOps()])
  patchSyncState({ pending: q.length, failed: f.length })
}

async function messageOf(res: Response): Promise<string> {
  try {
    const body = await res.json()
    return body.message || body.details || `Server said ${res.status}`
  } catch {
    return `Server said ${res.status}`
  }
}

async function send(op: QueuedOp, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { ...op.headers, apikey: anonKey, authorization: `Bearer ${token ?? anonKey}` }
  if (headers.prefer) headers.prefer = headers.prefer.replace("return=representation", "return=minimal")
  else headers.prefer = "return=minimal"
  return fetch(supabaseUrl + op.path, { method: op.method, headers, body: op.body })
}

/** When two devices were both offline they may have taken the same number; give this one a new one. */
async function renumber(op: QueuedOp): Promise<QueuedOp | null> {
  const column = op.table === "orders" ? "order_number" : op.table === "customers" ? "customer_code" : null
  if (!column || op.method !== "POST" || !op.body) return null
  const helpers = await import("@/lib/helpers")
  const next = op.table === "orders" ? await helpers.generateOrderNumber() : await helpers.generateCustomerCode()
  const body = JSON.parse(op.body)
  const rows: Row[] = Array.isArray(body) ? body : [body]
  for (const row of rows) row[column] = next
  const local = await loadRows(op.table)
  const changed = local.filter((r) => rows.some((x) => x.id === r.id)).map((r) => ({ ...r, [column]: next }))
  await saveRows(op.table, changed, { replace: false })
  return { ...op, body: JSON.stringify(Array.isArray(body) ? rows : rows[0]) }
}

let flushing = false

export async function flushQueue(): Promise<void> {
  if (flushing || !isOnline()) return
  flushing = true
  patchSyncState({ syncing: true })
  let sent = 0
  try {
    let ops = await queuedOps()
    for (let i = 0; i < ops.length; i++) {
      let op = ops[i]
      let token = await tokenProvider()
      let res: Response
      try {
        res = await send(op, token)
        if (res.status === 401) {
          token = await tokenProvider()
          res = await send(op, token)
        }
        if (res.status === 409 && (await res.clone().text()).includes("23505")) {
          const fixed = await renumber(op)
          if (fixed) {
            op = fixed
            await updateQueued(op)
            res = await send(op, token)
          }
        }
      } catch {
        reportNetworkFailure()
        break
      }
      if (res.ok) {
        await dropQueued(op.seq!)
        sent++
        await refreshCounts()
      } else if (res.status === 401 || res.status >= 500 || res.status === 429 || res.status === 408) {
        break // try again later
      } else {
        await markFailed(op, await messageOf(res))
        await refreshCounts()
      }
    }
  } finally {
    flushing = false
    await refreshCounts()
    patchSyncState({ syncing: false, ...(sent > 0 ? { syncVersion: getSyncState().syncVersion + 1, lastBatch: sent } : {}) })
  }
}

let started = false
export function startSync() {
  if (started) return
  started = true
  void refreshCounts().then(() => {
    if (getSyncState().pending > 0) void flushQueue()
  })
  onConnectivityChange((online) => {
    if (online) void flushQueue()
  })
  // A failed attempt (server hiccup) is retried while changes are waiting.
  setInterval(() => {
    if (getSyncState().pending > 0 && isOnline()) void flushQueue()
  }, 30000)
}
