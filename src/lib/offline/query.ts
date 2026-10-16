// Answers the app's data requests from saved rows when the network is gone.
// It understands the small slice of the PostgREST query language that the app
// uses: select, eq/neq/gt/gte/lt/lte/like/ilike/is/in (+ not.), or, order,
// limit, offset.

export type Row = Record<string, unknown>

export interface ParsedQuery {
  table: string
  columns: string[] | null
  /** The select asks for related tables, which saved rows can't answer. */
  hasEmbed: boolean
  filters: ((row: Row) => boolean)[]
  /** Any condition at all (used to decide whether a result is the whole table). */
  filtered: boolean
  order: { col: string; desc: boolean; nullsFirst?: boolean }[]
  limit?: number
  offset?: number
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"])

function splitTop(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let cur = ""
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === "(") depth++
    if (!quoted && ch === ")") depth--
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(cur)
      cur = ""
    } else cur += ch
  }
  if (cur) parts.push(cur)
  return parts
}

function unquote(s: string): string {
  const t = s.trim()
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/\\"/g, '"') : t
}

function compare(a: unknown, b: string): number {
  if (typeof a === "number") return a - Number(b)
  const left = String(a)
  return left < b ? -1 : left > b ? 1 : 0
}

function likeRegex(pattern: string, caseless: boolean): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*").replace(/_/g, ".")
  return new RegExp(`^${escaped}$`, caseless ? "i" : "")
}

function condition(col: string, spec: string): (row: Row) => boolean {
  let negate = false
  let rest = spec
  if (rest.startsWith("not.")) {
    negate = true
    rest = rest.slice(4)
  }
  const dot = rest.indexOf(".")
  const op = dot === -1 ? rest : rest.slice(0, dot)
  const value = dot === -1 ? "" : rest.slice(dot + 1)
  let test: (row: Row) => boolean
  switch (op) {
    case "eq":
      test = (r) => r[col] != null && String(r[col]) === value
      break
    case "neq":
      test = (r) => r[col] == null || String(r[col]) !== value
      break
    case "gt":
      test = (r) => r[col] != null && compare(r[col], value) > 0
      break
    case "gte":
      test = (r) => r[col] != null && compare(r[col], value) >= 0
      break
    case "lt":
      test = (r) => r[col] != null && compare(r[col], value) < 0
      break
    case "lte":
      test = (r) => r[col] != null && compare(r[col], value) <= 0
      break
    case "like":
    case "ilike": {
      const re = likeRegex(value, op === "ilike")
      test = (r) => r[col] != null && re.test(String(r[col]))
      break
    }
    case "is":
      test = (r) => (value === "null" ? r[col] == null : value === "true" ? r[col] === true : r[col] === false)
      break
    case "in": {
      const list = splitTop(value.replace(/^\(/, "").replace(/\)$/, "")).map(unquote)
      test = (r) => r[col] != null && list.includes(String(r[col]))
      break
    }
    default:
      test = () => true
  }
  return negate ? (r) => !test(r) : test
}

function orCondition(expr: string): (row: Row) => boolean {
  const inner = expr.replace(/^\(/, "").replace(/\)$/, "")
  const tests = splitTop(inner).map((part) => {
    const dot = part.indexOf(".")
    return condition(part.slice(0, dot), part.slice(dot + 1))
  })
  return (r) => tests.some((t) => t(r))
}

export function parseQuery(url: URL): ParsedQuery {
  const table = decodeURIComponent(url.pathname.split("/rest/v1/")[1] ?? "").split("/")[0]
  const select = url.searchParams.get("select")
  const hasEmbed = !!select && select.includes("(")
  const columns = select && select !== "*" && !hasEmbed ? select.split(",").map((c) => c.trim()).filter(Boolean) : null
  const filters: ParsedQuery["filters"] = []
  for (const [key, value] of url.searchParams) {
    if (RESERVED.has(key)) continue
    if (key === "or") filters.push(orCondition(value))
    else if (key === "and") filters.push((r) => splitTop(value.replace(/^\(/, "").replace(/\)$/, "")).every((p) => {
      const dot = p.indexOf(".")
      return condition(p.slice(0, dot), p.slice(dot + 1))(r)
    }))
    else filters.push(condition(key, value))
  }
  const order = (url.searchParams.get("order") ?? "")
    .split(",")
    .filter(Boolean)
    .map((part) => {
      const bits = part.split(".")
      return { col: bits[0], desc: bits[1] === "desc", nullsFirst: bits.includes("nullsfirst") ? true : bits.includes("nullslast") ? false : undefined }
    })
  const limit = url.searchParams.get("limit")
  const offset = url.searchParams.get("offset")
  return {
    table,
    columns,
    hasEmbed,
    filters,
    filtered: filters.length > 0,
    order,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  }
}

export function matches(row: Row, q: ParsedQuery): boolean {
  return q.filters.every((f) => f(row))
}

function sortRows(rows: Row[], order: ParsedQuery["order"]): Row[] {
  if (order.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const { col, desc, nullsFirst } of order) {
      const x = a[col]
      const y = b[col]
      if (x == null && y == null) continue
      // PostgreSQL puts nulls last when ascending and first when descending.
      const nullsOnTop = nullsFirst ?? desc
      if (x == null) return nullsOnTop ? -1 : 1
      if (y == null) return nullsOnTop ? 1 : -1
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0
      if (c !== 0) return desc ? -c : c
    }
    return 0
  })
}

/** Runs a read against saved rows: filter, sort, page, pick columns. `total` is the count before paging. */
export function runQuery(all: Row[], q: ParsedQuery, rangeHeader?: string | null): { rows: Row[]; total: number } {
  const found = sortRows(all.filter((r) => matches(r, q)), q.order)
  const total = found.length
  let offset = q.offset ?? 0
  let limit = q.limit
  const range = rangeHeader?.match(/^(\d+)-(\d*)$/)
  if (range) {
    offset = Number(range[1])
    if (range[2]) limit = Number(range[2]) - offset + 1
  }
  const page = found.slice(offset, limit != null ? offset + limit : undefined)
  const cols = q.columns
  return { rows: cols ? page.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) : page, total }
}
