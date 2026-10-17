import { Check } from "lucide-react"

import { useNotice, useNoticeHost } from "@/lib/notify"

/**
 * A slim strip across the top that says what was just saved, then goes away.
 * It floats over the page, so showing it never moves anything.
 */
export function NoticeBanner() {
  useNoticeHost()
  const notice = useNotice()
  if (!notice) return null
  return (
    <div
      key={notice.id}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[100] flex h-7 items-center justify-center gap-2 bg-emerald-600 px-3 text-xs font-medium text-white shadow-sm animate-in slide-in-from-top-2 fade-in duration-200"
      style={{ top: "calc(env(safe-area-inset-top) + var(--offline-bar, 0px))" }}
    >
      <Check className="size-3.5 shrink-0" />
      <span className="truncate">{notice.text}</span>
    </div>
  )
}
