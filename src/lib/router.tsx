import * as React from "react"

export type Route =
  | { name: "dashboard" }
  | { name: "customers" }
  | { name: "customer-detail"; id: string }
  | { name: "orders" }
  | { name: "order-detail"; id: string }
  | { name: "order-new" }
  | { name: "payments" }
  | { name: "production" }
  | { name: "reports" }
  | { name: "config" }
  | { name: "whatsapp" }
  | { name: "users" }
  | { name: "audit" }
  | { name: "profile" }
  | { name: "platform-admin" }
  | { name: "login" }

interface RouterContextValue {
  route: Route
  navigate: (route: Route) => void
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

  React.useEffect(() => {
    if (!historyEntry()) {
      window.history.replaceState({ route, depth: 0 } satisfies HistoryEntry, "")
    }

    const onPopState = (e: PopStateEvent) => {
      const entry = e.state as HistoryEntry | null
      setRoute(entry?.route ?? { name: "dashboard" })
      window.scrollTo(0, 0)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navigate = React.useCallback((r: Route) => {
    const depth = (historyEntry()?.depth ?? 0) + 1
    window.history.pushState({ route: r, depth } satisfies HistoryEntry, "")
    setRoute(r)
    window.scrollTo(0, 0)
  }, [])

  return (
    <RouterContext.Provider value={{ route, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}

export function useRouter() {
  const ctx = React.useContext(RouterContext)
  if (!ctx) throw new Error("useRouter must be used within RouterProvider")
  return ctx
}
