import * as React from "react"

export type Route =
  | { name: "dashboard" }
  | { name: "more" }
  | { name: "customers" }
  | { name: "customer-detail"; id: string }
  | { name: "orders" }
  | { name: "order-detail"; id: string }
  | { name: "order-new" }
  | { name: "payments" }
  | { name: "expenses" }
  | { name: "production" }
  | { name: "reports" }
  | { name: "config" }
  | { name: "printer" }
  | { name: "whatsapp" }
  | { name: "users" }
  | { name: "audit" }
  | { name: "profile" }
  | { name: "help" }
  | { name: "faq" }
  | { name: "privacy" }
  | { name: "subscription" }
  | { name: "platform-admin" }
  | { name: "platform-admin-org"; id: string }
  | { name: "login" }

export type NavDirection = "forward" | "back"

interface RouterContextValue {
  route: Route
  /** Whether the latest route change moved deeper into history or back out of it. */
  direction: NavDirection
  navigate: (route: Route) => void
  /** The page one step back in this session's history, if the app knows it. */
  previousRoute: () => Route | undefined
  /**
   * Go back one page like a native app. Falls back to showing `fallback` in
   * place of the current page when there is nothing earlier to go back to
   * (opened from a reload or deep link).
   */
  goBack: (fallback: Route) => void
}

const RouterContext = React.createContext<RouterContextValue | undefined>(undefined)

interface HistoryEntry {
  route: Route
  depth: number
}

function historyEntry(): HistoryEntry | undefined {
  return (window.history.state as HistoryEntry | null) ?? undefined
}

/** Whether the in-app back-button handler can navigate back within the app (vs. exiting). */
export function canGoBackInApp(): boolean {
  return (historyEntry()?.depth ?? 0) > 0
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = React.useState<Route>(() => historyEntry()?.route ?? { name: "dashboard" })
  const [direction, setDirection] = React.useState<NavDirection>("forward")
  // Routes by history depth, kept in memory so "back" knows where it lands.
  // Lost on reload, in which case goBack() uses its fallback.
  const depthRef = React.useRef(historyEntry()?.depth ?? 0)
  const stackRef = React.useRef<Record<number, Route>>({ [depthRef.current]: route })

  React.useEffect(() => {
    if (!historyEntry()) {
      window.history.replaceState({ route, depth: 0 } satisfies HistoryEntry, "")
    }

    const onPopState = (e: PopStateEvent) => {
      const entry = e.state as HistoryEntry | null
      const depth = entry?.depth ?? 0
      setDirection(depth < depthRef.current ? "back" : "forward")
      depthRef.current = depth
      const next = entry?.route ?? { name: "dashboard" }
      stackRef.current[depth] = next
      setRoute(next)
      window.scrollTo(0, 0)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navigate = React.useCallback((r: Route) => {
    const depth = (historyEntry()?.depth ?? 0) + 1
    window.history.pushState({ route: r, depth } satisfies HistoryEntry, "")
    for (const key of Object.keys(stackRef.current)) {
      if (Number(key) >= depth) delete stackRef.current[Number(key)]
    }
    stackRef.current[depth] = r
    depthRef.current = depth
    setDirection("forward")
    setRoute(r)
    window.scrollTo(0, 0)
  }, [])

  const previousRoute = React.useCallback(
    () => (depthRef.current > 0 ? stackRef.current[depthRef.current - 1] : undefined),
    [],
  )

  const goBack = React.useCallback((fallback: Route) => {
    if (previousRoute()) {
      window.history.back()
      return
    }
    const depth = historyEntry()?.depth ?? 0
    window.history.replaceState({ route: fallback, depth } satisfies HistoryEntry, "")
    stackRef.current[depth] = fallback
    setDirection("back")
    setRoute(fallback)
    window.scrollTo(0, 0)
  }, [previousRoute])

  return (
    <RouterContext.Provider value={{ route, direction, navigate, previousRoute, goBack }}>
      {children}
    </RouterContext.Provider>
  )
}

export function useRouter() {
  const ctx = React.useContext(RouterContext)
  if (!ctx) throw new Error("useRouter must be used within RouterProvider")
  return ctx
}
