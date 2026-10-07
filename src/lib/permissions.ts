import type { UserRole } from "@/lib/types"
import type { Route } from "@/lib/router"
import { FEATURES } from "@/lib/features"

const DISABLED_ROUTES: Set<Route["name"]> = new Set([
  ...(FEATURES.subscription ? [] : (["subscription"] as const)),
  ...(FEATURES.whatsapp ? [] : (["whatsapp"] as const)),
])

// Reference pages every signed-in role can open.
const INFO_ROUTES: Route["name"][] = ["help", "faq", "privacy"]

/**
 * Which pages each role may open. Administrator always has full access.
 * Mirrors the role descriptions shown on the Users & Roles page:
 *  - Manager: orders, customers, payments, production — no configuration.
 *  - Operator: production-focused — view orders, update production stages.
 *  - Accounts: financial — payments, reports, customer billing.
 */
const ROLE_ROUTES: Record<Exclude<UserRole, "Administrator">, Route["name"][]> = {
  Manager: [
    "dashboard", "customers", "customer-detail", "orders", "order-detail",
    "order-new", "payments", "expenses", "production", "reports", "whatsapp", "profile",
  ],
  Operator: [
    "dashboard", "orders", "order-detail", "production", "profile",
  ],
  Accounts: [
    "dashboard", "orders", "order-detail", "customers", "customer-detail",
    "payments", "expenses", "reports", "profile",
  ],
}

export function canAccessRoute(role: UserRole | undefined, routeName: Route["name"]): boolean {
  if (DISABLED_ROUTES.has(routeName)) return false
  if (INFO_ROUTES.includes(routeName)) return true
  if (!role) return routeName === "profile"
  if (role === "Administrator") return true
  return ROLE_ROUTES[role]?.includes(routeName) ?? false
}

export function allowedRouteNames(role: UserRole | undefined): Set<Route["name"]> {
  if (!role || role === "Administrator") {
    const all = new Set<Route["name"]>([
      "dashboard", "customers", "customer-detail", "orders", "order-detail",
      "order-new", "payments", "expenses", "production", "reports", "config", "whatsapp",
      "users", "audit", "profile", "subscription",
    ])
    for (const name of INFO_ROUTES) all.add(name)
    for (const name of DISABLED_ROUTES) all.delete(name)
    return all
  }
  const allowed = new Set<Route["name"]>(ROLE_ROUTES[role] ?? ["profile"])
  for (const name of INFO_ROUTES) allowed.add(name)
  for (const name of DISABLED_ROUTES) allowed.delete(name)
  return allowed
}

/** Roles orders may be assigned to. */
export const ASSIGNABLE_ROLES: UserRole[] = ["Administrator", "Manager", "Operator"]
