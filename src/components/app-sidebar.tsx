import * as React from "react"
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  CreditCard,
  Factory,
  BarChart3,
  Settings,
  UserCog,
  ScrollText,
  Scissors,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useRouter, type Route } from "@/lib/router"
import { fetchBusinessSettings } from "@/lib/config"
import { useAuth } from "@/lib/use-auth"
import { cn } from "@/lib/utils"

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  route: Route
  matchPrefix?: string[]
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, route: { name: "dashboard" } },
      { label: "Orders", icon: ShoppingCart, route: { name: "orders" } },
      { label: "Customers", icon: Users, route: { name: "customers" } },
      { label: "Payments", icon: CreditCard, route: { name: "payments" } },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Production Board", icon: Factory, route: { name: "production" } },
      { label: "Reports", icon: BarChart3, route: { name: "reports" } },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Configuration", icon: Settings, route: { name: "config" } },
      { label: "Users & Roles", icon: UserCog, route: { name: "users" } },
      { label: "Audit Log", icon: ScrollText, route: { name: "audit" } },
    ],
  },
]

function routeMatches(current: Route, item: Route): boolean {
  if (current.name !== item.name) {
    if (item.name === "orders" && current.name === "order-detail") return true
    if (item.name === "orders" && current.name === "order-new") return true
    if (item.name === "customers" && current.name === "customer-detail") return true
    return false
  }
  return true
}

export function AppSidebar() {
  const { route, navigate } = useRouter()
  const { profile, user, signOut } = useAuth()
  const [companyName, setCompanyName] = React.useState("Embroidery Shop Manager")
  const [companyLogo, setCompanyLogo] = React.useState<string | null>(null)

  React.useEffect(() => {
    let isMounted = true

    void fetchBusinessSettings().then((settings) => {
      if (!isMounted) return
      setCompanyName((settings.company_name || "Embroidery Shop Manager").trim() || "Embroidery Shop Manager")
      setCompanyLogo(settings.company_logo_data_url || null)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const displayName =
    profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "User"

  const userRole = profile?.role || user?.user_metadata?.role || "User"

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-full w-full object-cover" />
            ) : (
              <Scissors className="size-5" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-sidebar-foreground">{companyName}</span>
            <span className="text-xs text-sidebar-foreground/60">Embroidery Shop Manager</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = routeMatches(route, item.route)
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => navigate(item.route)}
                        className={cn(
                          "cursor-pointer",
                          isActive && "bg-sidebar-primary text-sidebar-primary-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">
              {displayName}
            </span>
            <span className="truncate text-xs text-sidebar-foreground/60">
              {userRole}
            </span>
          </div>
          <button
            onClick={() => signOut()}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Sign Out
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
