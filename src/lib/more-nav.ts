import type * as React from "react"
import {
  Wallet,
  Factory,
  BarChart3,
  Settings,
  MessageCircle,
  UserCog,
  ScrollText,
  Crown,
  CircleUser,
  LifeBuoy,
  CircleHelp,
  ShieldCheck,
} from "lucide-react"

import type { Route } from "@/lib/router"

export interface MoreItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  route: Route
}

// Everything behind the mobile "More" tab. Pages that are switched off or not
// allowed for the signed-in role are filtered out where this is rendered.
export const MORE_GROUPS: { label: string; items: MoreItem[] }[] = [
  {
    label: "Operations",
    items: [
      { label: "Expenses", icon: Wallet, route: { name: "expenses" } },
      { label: "Production Board", icon: Factory, route: { name: "production" } },
      { label: "Reports", icon: BarChart3, route: { name: "reports" } },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Configuration", icon: Settings, route: { name: "config" } },
      { label: "WhatsApp", icon: MessageCircle, route: { name: "whatsapp" } },
      { label: "Users & Roles", icon: UserCog, route: { name: "users" } },
      { label: "Audit Log", icon: ScrollText, route: { name: "audit" } },
      { label: "Subscription", icon: Crown, route: { name: "subscription" } },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "My Profile", icon: CircleUser, route: { name: "profile" } },
      { label: "Help", icon: LifeBuoy, route: { name: "help" } },
      { label: "FAQ", icon: CircleHelp, route: { name: "faq" } },
      { label: "Privacy Policy", icon: ShieldCheck, route: { name: "privacy" } },
    ],
  },
]

const MORE_CHILD_NAMES = new Set<Route["name"]>(MORE_GROUPS.flatMap((g) => g.items.map((i) => i.route.name)))

/** A page opened from the More list (as opposed to More itself or a main tab). */
export function isMoreChild(name: Route["name"]): boolean {
  return MORE_CHILD_NAMES.has(name)
}

/** More and every page opened from it — the pages that slide in and out like a native stack. */
export function isMoreStackRoute(name: Route["name"]): boolean {
  return name === "more" || MORE_CHILD_NAMES.has(name)
}

export function routeKey(route: Route): string {
  return JSON.stringify(route)
}
