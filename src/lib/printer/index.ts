import { canvasToBitmap, receiptJob } from "./escpos"
import { buildInvoiceBlocks, buildOrderTagBlocks, renderReceipt, type InvoiceData, type ReceiptBlock } from "./receipt"
import {
  availableKinds,
  connectPrinter,
  PrinterError,
  type PrinterKind,
  type Transport,
} from "./transports"
import type { Customer, Order } from "@/lib/types"

export { availableKinds, kindLabel, PrinterError, type PrinterKind } from "./transports"
export { buildInvoiceBlocks, buildOrderTagBlocks } from "./receipt"
export type { InvoiceData, ReceiptBlock } from "./receipt"

// The printer belongs to the device, not the shop: a phone and the shop
// computer each remember their own.

export type PaperDots = 384 | 576 | 832

export const PAPER_SIZES: { dots: PaperDots; label: string }[] = [
  { dots: 384, label: "58 mm (2 inch)" },
  { dots: 576, label: "80 mm (3 inch)" },
  { dots: 832, label: "104 mm (4 inch)" },
]

export interface PrinterSettings {
  kind: PrinterKind
  name: string
  ref: Transport["ref"]
  /** Printable dots across the paper: 384 for 58mm, 576 for 80mm, 832 for 4 inch (104mm). */
  paperDots: PaperDots
  /** Blank lines fed after the receipt so it clears the cutter / tear bar. */
  feedLines?: number
  /** Blank dots left above the receipt (8 dots = 1 mm). */
  topSpace?: number
  /** Draw a frame round the receipt. */
  border?: boolean
  /** Cut the paper after each receipt (ignored by printers without a cutter). */
  cut?: boolean
}

export interface ReceiptOptions {
  paperDots: PaperDots
  feedLines: number
  topSpace: number
  border: boolean
  cut: boolean
}

export const DEFAULT_FEED_LINES = 6

/** The saved settings with defaults filled in. */
export function getReceiptOptions(): ReceiptOptions {
  const s = getPrinterSettings()
  return {
    paperDots: s?.paperDots ?? 576,
    feedLines: s?.feedLines ?? DEFAULT_FEED_LINES,
    topSpace: s?.topSpace ?? 0,
    border: s?.border ?? true,
    cut: s?.cut ?? true,
  }
}

const KEY = "receipt_printer_v1"
const listeners = new Set<() => void>()
let active: Transport | null = null

function emit() {
  for (const l of listeners) l()
}

export function onPrinterChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPrinterSettings(): PrinterSettings | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PrinterSettings) : null
  } catch {
    return null
  }
}

function save(settings: PrinterSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable — the printer just has to be chosen again next time
  }
  emit()
}

/** Changes how receipts are laid out and fed, keeping the chosen printer. */
export function updatePrinterOptions(patch: Partial<Pick<PrinterSettings, "paperDots" | "feedLines" | "topSpace" | "border" | "cut">>) {
  const current = getPrinterSettings()
  if (current) save({ ...current, ...patch })
  else save({ kind: availableKinds()[0] ?? "usb", name: "", ref: {}, paperDots: 576, ...patch })
}

export function setPaperWidth(paperDots: PaperDots) {
  updatePrinterOptions({ paperDots })
}

export function isPrinterConnected(): boolean {
  return active !== null
}

export async function forgetPrinter() {
  if (active) await active.close().catch(() => {})
  active = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  emit()
}

/**
 * Asks the system to pick a printer (must follow a tap) and remembers it.
 * `kind` defaults to the best connection this device has.
 */
export async function pairPrinter(kind?: PrinterKind): Promise<PrinterSettings> {
  const chosen = kind ?? availableKinds()[0]
  if (!chosen) {
    throw new PrinterError(
      "This browser can't talk to a printer directly",
      "Use Chrome or Edge on a computer, or the Android / iPhone app. \"Print with the browser\" still works.",
    )
  }
  if (active) await active.close().catch(() => {})
  active = null
  const transport = await connectPrinter(chosen)
  active = transport
  const previous = getPrinterSettings()
  const settings: PrinterSettings = {
    kind: transport.kind,
    name: transport.name,
    ref: transport.ref,
    paperDots: previous?.paperDots ?? 576,
  }
  save(settings)
  return settings
}

async function ensureTransport(): Promise<Transport> {
  if (active) return active
  const saved = getPrinterSettings()
  if (saved) {
    try {
      active = await connectPrinter(saved.kind, saved.ref)
      return active
    } catch (err) {
      // A saved Bluetooth printer that's off or out of range lands here; fall
      // through to asking, which also covers a printer that was swapped.
      if (!(err instanceof PrinterError) || saved.kind === "usb" || saved.kind === "serial") throw err
    }
  }
  await pairPrinter(saved?.kind)
  if (!active) throw new PrinterError("No printer was chosen")
  return active
}

export function currentPaperDots(): PaperDots {
  return getPrinterSettings()?.paperDots ?? 576
}

/**
 * What a receipt will look like on paper: the same black-and-white dots that
 * are sent to the printer, as an image, so the preview is exactly the print.
 */
export async function renderReceiptPreview(blocks: ReceiptBlock[]): Promise<{ url: string; width: number; height: number }> {
  const opts = getReceiptOptions()
  const canvas = await renderReceipt(blocks, opts.paperDots, { border: opts.border, topSpace: opts.topSpace })
  const bitmap = canvasToBitmap(canvas)
  const out = document.createElement("canvas")
  out.width = bitmap.width
  out.height = bitmap.height
  const ctx = out.getContext("2d")!
  const image = ctx.createImageData(bitmap.width, bitmap.height)
  for (let i = 0; i < bitmap.dots.length; i++) {
    const v = bitmap.dots[i] ? 0 : 255
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return { url: out.toDataURL("image/png"), width: bitmap.width, height: bitmap.height }
}

/** Whether this browser can talk to a printer directly (Chrome/Edge, or the phone apps). */
export function canPrintDirect(): boolean {
  return availableKinds().length > 0
}

/**
 * Prints through the system's own print dialog instead — for browsers that
 * can't reach a printer directly (Firefox, Safari) and for printers that are
 * installed on the computer with a normal driver. The page is exactly the
 * receipt image, sized to the paper.
 */
export async function printViaBrowser(blocks: ReceiptBlock[]): Promise<void> {
  const { url, width } = await renderReceiptPreview(blocks)
  const dots = currentPaperDots()
  const paperMm = dots === 384 ? 58 : dots === 576 ? 80 : 104
  const imageMm = width / 8
  const frame = document.createElement("iframe")
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>` +
      `@page{size:${paperMm}mm auto;margin:0}html,body{margin:0;padding:0;background:#fff}` +
      `img{display:block;width:${imageMm}mm;margin:0 auto;image-rendering:pixelated}` +
      `</style></head><body><img id="r" src="${url}"></body></html>`,
  )
  doc.close()
  const img = doc.getElementById("r") as HTMLImageElement
  await (img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve() }))
  frame.contentWindow!.focus()
  frame.contentWindow!.print()
  setTimeout(() => frame.remove(), 60000)
}

/** Sends already-built receipt blocks to the printer, connecting first if needed. */
export async function printBlocks(blocks: ReceiptBlock[]): Promise<void> {
  // Connect first: choosing a printer needs the tap that started this, and
  // the browser only honours that for a few seconds.
  const transport = await ensureTransport()
  const opts = getReceiptOptions()
  const canvas = await renderReceipt(blocks, opts.paperDots, { border: opts.border, topSpace: opts.topSpace })
  const job = receiptJob(canvasToBitmap(canvas), { feedLines: opts.feedLines, cut: opts.cut })
  try {
    await transport.write(job)
  } catch {
    // The link dropped (printer switched off, moved away). Forget it so the
    // next print reconnects instead of failing the same way.
    active = null
    emit()
    throw new PrinterError(
      "The printer stopped responding",
      "Check that it is on, has paper and is close by, then try again.",
    )
  }
}

export async function printInvoiceThermal(data: InvoiceData): Promise<void> {
  await printBlocks(await buildInvoiceBlocks(data))
}

export async function printOrderTagThermal(order: Order, customer: Customer | null): Promise<void> {
  await printBlocks(await buildOrderTagBlocks(order, customer))
}

/** A short test slip so the connection and paper width can be checked. */
export async function printTestPage(): Promise<void> {
  const blocks = ([
      { t: "text", text: "Printer test", align: "center", size: "big", bold: true },
      { t: "divider" },
      { t: "row", left: "Rupee sign", right: "₹1,234.50" },
      { t: "row", left: "Bold row", right: "OK", bold: true },
      { t: "text", text: "தையல் • Tamil text", size: "normal" },
      { t: "text", text: "If every line is complete and not cut off at the edges, the paper width is right.", size: "small", muted: true },
      { t: "divider" },
  ] as ReceiptBlock[])
  if (canPrintDirect()) await printBlocks(blocks)
  else await printViaBrowser(blocks)
}
