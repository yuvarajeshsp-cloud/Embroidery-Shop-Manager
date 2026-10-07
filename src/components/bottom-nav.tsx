import * as React from "react"
import { LayoutDashboard, ShoppingCart, Users, CreditCard, Menu } from "lucide-react"

import { useRouter, type Route } from "@/lib/router"
import { useAuth } from "@/lib/use-auth"
import { allowedRouteNames } from "@/lib/permissions"
import { isMoreStackRoute } from "@/lib/more-nav"
import { cn } from "@/lib/utils"

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  route: Route
}

const tabs: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, route: { name: "dashboard" } },
  { label: "Orders", icon: ShoppingCart, route: { name: "orders" } },
  { label: "Customers", icon: Users, route: { name: "customers" } },
  { label: "Payments", icon: CreditCard, route: { name: "payments" } },
]

function routeMatches(current: Route, item: Route): boolean {
  if (current.name !== item.name) {
    if (item.name === "orders" && (current.name === "order-detail" || current.name === "order-new")) return true
    if (item.name === "customers" && current.name === "customer-detail") return true
    return false
  }
  return true
}

export function BottomNav() {
  const { route, navigate, previousRoute, goBack } = useRouter()
  const { profile } = useAuth()
  const allowed = allowedRouteNames(profile?.role)
  const visibleTabs = tabs.filter((t) => allowed.has(t.route.name))
  const isMoreActive = isMoreStackRoute(route.name)

  function openMore() {
    if (route.name === "more") return
    // From a page opened out of More, the tab pops back to the list rather
    // than stacking a second copy of it.
    if (isMoreStackRoute(route.name) && previousRoute()?.name === "more") {
      goBack({ name: "more" })
      return
    }
    navigate({ name: "more" })
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)]">
      {visibleTabs.map((tab) => {
        const Icon = tab.icon
        const isActive = routeMatches(route, tab.route)
        return (
          <button
            key={tab.label}
            onClick={() => navigate(tab.route)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {tab.label}
          </button>
        )
      })}
      <button
        onClick={openMore}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]",
          isMoreActive ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Menu className="size-5" />
        More
      </button>
    </nav>
  )
}
