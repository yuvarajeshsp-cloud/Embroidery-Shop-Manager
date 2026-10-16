import * as React from "react"
import { CloudOff, RefreshCw, TriangleAlert, Wifi } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useOnline } from "@/lib/offline/connectivity"
import { flushQueue, refreshCounts } from "@/lib/offline/engine"
import { getSyncState, useSyncState } from "@/lib/offline/state"
import { discardFailed, failedOps, retryFailed, type QueuedOp } from "@/lib/offline/store"
import { cn } from "@/lib/utils"

const NOUN: Record<string, string> = {
  orders: "order",
  order_items: "order item",
  order_additional_costs: "extra cost",
  customers: "customer",
  payments: "payment",
  expenses: "expense",
  config_items: "setting",
  business_settings: "business setting",
  order_item_attachments: "photo",
  audit_logs: "history entry",
}

const VERB = { POST: "Add", PATCH: "Change", DELETE: "Remove" } as const

function describe(op: QueuedOp) {
  return `${VERB[op.method]} ${NOUN[op.table] ?? op.table.replace(/_/g, " ")}`
}

function IssuesDialog({ onClose }: { onClose: () => void }) {
  const [ops, setOps] = React.useState<QueuedOp[] | null>(null)
  React.useEffect(() => {
    void failedOps().then(setOps)
  }, [])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Changes that couldn't be saved</DialogTitle>
          <DialogDescription>
            These were made while offline, but the server turned them down. Retry once the cause is fixed, or discard them.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {(ops ?? []).map((op) => (
            <li key={op.seq} className="rounded-lg border p-3 text-sm">
              <div className="font-medium">{describe(op)}</div>
              <div className="text-xs text-muted-foreground">{op.error}</div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={async () => {
              await discardFailed()
              await refreshCounts()
              onClose()
            }}
          >
            Discard
          </Button>
          <Button
            onClick={async () => {
              await retryFailed()
              await refreshCounts()
              onClose()
              void flushQueue()
            }}
          >
            Retry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A slim strip at the top of the app: offline, syncing, or something that
 * needs attention. It also announces going offline and coming back with a toast.
 */
export function OfflineBanner() {
  const online = useOnline()
  const { pending, failed, syncing, syncVersion, lastBatch } = useSyncState()
  const [notice, setNotice] = React.useState<string | null>(null)
  const [reviewing, setReviewing] = React.useState(false)
  const first = React.useRef(true)
  const seenVersion = React.useRef(syncVersion)

  // Say so when the connection changes — not on the first render.
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (online) {
      toast.success("You're back online", {
        id: "connectivity",
        description: getSyncState().pending > 0 ? "Sending the changes saved on this device." : "Everything is up to date.",
        duration: 4000,
      })
      setNotice("Back online")
    } else {
      toast.warning("You're offline", {
        id: "connectivity",
        description: "You can keep working. Changes are saved on this device and sync when you're back online.",
        duration: 6000,
      })
    }
  }, [online])

  React.useEffect(() => {
    if (syncVersion === seenVersion.current) return
    seenVersion.current = syncVersion
    setNotice(`${lastBatch} change${lastBatch === 1 ? "" : "s"} synced`)
    toast.success(`${lastBatch} change${lastBatch === 1 ? "" : "s"} synced`, { id: "synced" })
  }, [syncVersion, lastBatch])

  React.useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(t)
  }, [notice])

  let tone: "offline" | "syncing" | "failed" | "ok" | null = null
  let text = ""
  let Icon = Wifi
  if (!online) {
    tone = "offline"
    Icon = CloudOff
    text = pending > 0 ? `Offline · ${pending} change${pending === 1 ? "" : "s"} will sync when you're back` : "Offline · showing saved data"
  } else if (syncing || pending > 0) {
    tone = "syncing"
    Icon = RefreshCw
    text = `Syncing ${pending} change${pending === 1 ? "" : "s"}…`
  } else if (failed > 0) {
    tone = "failed"
    Icon = TriangleAlert
    text = `${failed} change${failed === 1 ? "" : "s"} couldn't be saved`
  } else if (notice) {
    tone = "ok"
    text = notice
  }

  // Lets full-height layers (page transitions) start below the strip.
  React.useEffect(() => {
    document.documentElement.style.setProperty("--offline-bar", tone ? "1.75rem" : "0px")
    return () => {
      document.documentElement.style.removeProperty("--offline-bar")
    }
  }, [tone])

  if (!tone) return null

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "sticky top-[env(safe-area-inset-top)] z-[60] flex h-7 items-center justify-center gap-2 px-3 text-xs font-medium",
          tone === "offline" && "bg-amber-500 text-amber-950",
          tone === "syncing" && "bg-sky-600 text-white",
          tone === "failed" && "bg-red-600 text-white",
          tone === "ok" && "bg-emerald-600 text-white",
        )}
      >
        <Icon className={cn("size-3.5 shrink-0", tone === "syncing" && "animate-spin")} />
        <span className="truncate">{text}</span>
        {tone === "failed" && (
          <button className="ml-1 underline underline-offset-2" onClick={() => setReviewing(true)}>
            Review
          </button>
        )}
      </div>
      {reviewing && <IssuesDialog onClose={() => setReviewing(false)} />}
    </>
  )
}
