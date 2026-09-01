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
  | { name: "users" }
  | { name: "audit" }
  | { name: "login" }

interface RouterContextValue {
  route: Route
  navigate: (route: Route) => void
}

const RouterContext = React.createContext<RouterContextValue | undefined>(undefined)

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = React.useState<Route>({ name: "dashboard" })

  const navigate = React.useCallback((r: Route) => {
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
