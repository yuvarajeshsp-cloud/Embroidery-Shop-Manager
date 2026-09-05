import * as React from "react"
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  CreditCard,
  Menu,
  Factory,
  BarChart3,
  Settings,
  UserCog,
  ScrollText,
  MessageCircle,
  LogOut,
} from "lucide-react"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useRouter, type Route } from "@/lib/router"
import { useAuth } from "@/lib/use-auth"
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

const moreItems: NavItem[] = [
  { label: "Production Board", icon: Factory, route: { name: "production" } },
  { label: "Reports", icon: BarChart3, route: { name: "reports" } },
  { label: "Configuration", icon: Settings, route: { name: "config" } },
  { label: "WhatsApp", icon: MessageCircle, route: { name: "whatsapp" } },
  { label: "Users & Roles", icon: UserCog, route: { name: "users" } },
  { label: "Audit Log", icon: ScrollText, route: { name: "audit" } },
]

function routeMatches(current: Route, item: Route): boolean {
  if (current.name !== item.name) {
    if (item.name === "orders" && (current.name === "order-detail" || current.name === "order-new")) return true
    if (item.name === "customers" && current.name === "customer-detail") return true
    return false
  }
  return true
}

const moreRouteNames = new Set(moreItems.map((i) => i.route.name))

export function BottomNav() {
  const { route, navigate } = useRouter()
  const { signOut } = useAuth()
  const [showMore, setShowMore] = React.useState(false)

  const isMoreActive = moreRouteNames.has(route.name)

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
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
          onClick={() => setShowMore(true)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 text-[11px]",
            isMoreActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Menu className="size-5" />
          More
        </button>
      </nav>

      <Sheet open={showMore} onOpenChange={setShowMore}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription>Operations and admin tools</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {moreItems.map((item) => {
              const Icon = item.icon
              const isActive = routeMatches(route, item.route)
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    navigate(item.route)
                    setShowMore(false)
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm",
                    isActive ? "bg-accent font-medium text-accent-foreground" : "text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              )
            })}
            <button
              onClick={() => {
                setShowMore(false)
                signOut()
              }}
              className="mt-2 flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-destructive"
            >
              <LogOut className="size-4" />
              Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
