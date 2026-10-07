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

// The selected tab is cut out of the bar in the page's own colour, with
// rounded bottom corners and softened shoulders where it meets the bar's top
// edge, so the page appears to flow down into the bar.
const FILLET = 14

function ActiveNotch() {
  const fillet = (side: "left" | "right") => (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0"
      style={{
        width: FILLET,
        height: FILLET,
        [side === "left" ? "left" : "right"]: 6 - FILLET,
        background: `radial-gradient(circle at ${side === "left" ? "0" : "100%"} 100%, transparent ${FILLET}px, var(--background) ${FILLET + 0.5}px)`,
      }}
    />
  )
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-x-1.5 top-0 bottom-2 rounded-b-[22px] bg-background" />
      {fillet("left")}
      {fillet("right")}
    </>
  )
}

function Tab({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-1 pb-2 text-[11px] transition-colors",
        active ? "font-semibold text-foreground" : "text-sidebar-foreground/75",
      )}
    >
      {active && <ActiveNotch />}
      <Icon className={cn("relative size-5", active && "text-primary")} />
      <span className="relative">{label}</span>
    </button>
  )
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
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch rounded-t-[28px] border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)]">
      {visibleTabs.map((tab) => (
        <Tab
          key={tab.label}
          label={tab.label}
          icon={tab.icon}
          active={routeMatches(route, tab.route)}
          onClick={() => navigate(tab.route)}
        />
      ))}
      <Tab label="More" icon={Menu} active={isMoreActive} onClick={openMore} />
    </nav>
  )
}
