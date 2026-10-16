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
  { label: "Customers", icon: Users, route: { name: "customers" } },
  { label: "Orders", icon: ShoppingCart, route: { name: "orders" } },
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
// edge, so the page appears to flow down into the bar. One cut-out slides
// from tab to tab, so choosing a tab animates instead of jumping.
const FILLET = 14
const SHOULDER = 6
const SLIDE = "300ms cubic-bezier(0.32, 0.72, 0, 1)"

function ActiveNotch({ index, count }: { index: number; count: number }) {
  const visible = index >= 0
  const at = Math.max(index, 0)
  // On the outermost tabs the cut-out runs flush to the screen edge, with no
  // shoulder on that side, so nothing pokes out past the bar's own corner.
  const first = at === 0
  const last = at === count - 1
  const left = first ? 0 : SHOULDER
  const right = last ? 0 : SHOULDER
  const fillet = (side: "left" | "right", show: boolean) => (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0"
      style={{
        width: FILLET,
        height: FILLET,
        [side]: -FILLET,
        opacity: show ? 1 : 0,
        transition: `opacity ${SLIDE}`,
        background: `radial-gradient(circle at ${side === "left" ? "0" : "100%"} 100%, transparent ${FILLET}px, var(--background) ${FILLET + 0.5}px)`,
      }}
    />
  )
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0 rounded-b-[22px] bg-background motion-reduce:!transition-none"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 0.5rem)",
        left: `calc(${(at * 100) / count}% + ${left}px)`,
        width: `calc(${100 / count}% - ${left + right}px)`,
        opacity: visible ? 1 : 0,
        transition: `left ${SLIDE}, width ${SLIDE}, opacity 200ms ease`,
      }}
    >
      {fillet("left", !first)}
      {fillet("right", !last)}
    </span>
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
        // No tap flash, text selection or callout while a tab is pressed and held.
        "nav-tab relative flex flex-1 select-none flex-col items-center justify-center gap-1 pb-2 text-[11px] outline-none transition-colors duration-300 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [touch-action:manipulation]",
        active ? "font-semibold text-foreground" : "text-sidebar-foreground/75",
      )}
    >
      <Icon className={cn("relative size-5 transition-colors duration-300", active && "text-primary")} />
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
  const tabIndex = visibleTabs.findIndex((t) => routeMatches(route, t.route))
  const activeIndex = isMoreActive ? visibleTabs.length : tabIndex

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
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch rounded-t-[28px] bg-sidebar pb-[env(safe-area-inset-bottom)]">
      <ActiveNotch index={activeIndex} count={visibleTabs.length + 1} />
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
