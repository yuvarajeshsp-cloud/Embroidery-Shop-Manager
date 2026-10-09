// The bare shop-type definitions. Kept free of imports so business-profile.ts
// (which stores the shop type) and shop-type.ts (which reads it through
// business-profile) don't import each other.

export type ShopType = "embroidery" | "tailor" | "boutique" | "mixed"

export const DEFAULT_SHOP_TYPE: ShopType = "embroidery"

export function isShopType(value: unknown): value is ShopType {
  return value === "embroidery" || value === "tailor" || value === "boutique" || value === "mixed"
}
