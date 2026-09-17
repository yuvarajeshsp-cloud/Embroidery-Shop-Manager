import type { UserRole } from "@/lib/types"
import type { Route } from "@/lib/router"

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
  if (!role) return routeName === "profile"
  if (role === "Administrator") return true
  return ROLE_ROUTES[role]?.includes(routeName) ?? false
}

export function allowedRouteNames(role: UserRole | undefined): Set<Route["name"]> {
  if (!role || role === "Administrator") {
    return new Set([
      "dashboard", "customers", "customer-detail", "orders", "order-detail",
      "order-new", "payments", "expenses", "production", "reports", "config", "whatsapp",
      "users", "audit", "profile",
    ])
  }
  return new Set(ROLE_ROUTES[role] ?? ["profile"])
}

/** Roles orders may be assigned to. */
export const ASSIGNABLE_ROLES: UserRole[] = ["Administrator", "Manager", "Operator"]
