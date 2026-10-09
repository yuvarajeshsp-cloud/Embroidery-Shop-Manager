import { useBusinessProfile } from "@/lib/business-profile"
import { DEFAULT_SHOP_TYPE, isShopType, type ShopType } from "@/lib/shop-type-core"

export { DEFAULT_SHOP_TYPE, isShopType, type ShopType }

// A shop's type decides the wording, the way items are priced by default and
// which starter lists it gets. The lists themselves are seeded in the database
// (apply_shop_type); everything else about the type lives here.

export const SHOP_TYPES: { value: ShopType; label: string; description: string }[] = [
  {
    value: "embroidery",
    label: "Embroidery shop",
    description: "Machine embroidery and digitizing, priced by stitch count.",
  },
  {
    value: "tailor",
    label: "Tailor",
    description: "Stitching and alterations, priced per garment, with measurements and trials.",
  },
  {
    value: "boutique",
    label: "Boutique",
    description: "Designer blouses and outfits, with materials, outside work and trials.",
  },
  {
    value: "mixed",
    label: "Mixed",
    description: "A bit of everything: embroidery, stitching and alterations.",
  },
]

export type PricingMode = "stitch" | "piece" | "metre" | "fixed"

export const PRICING_MODES: { value: PricingMode; label: string; hint: string }[] = [
  { value: "stitch", label: "By stitch", hint: "Stitch count × rate per 1,000 stitches" },
  { value: "piece", label: "Per piece", hint: "Price for each garment or piece" },
  { value: "metre", label: "Per metre", hint: "Price for each metre" },
  { value: "fixed", label: "Fixed price", hint: "One price for the whole item" },
]

export function pricingModeOf(item: { pricing_mode?: string | null }): PricingMode {
  const mode = item.pricing_mode
  return mode === "piece" || mode === "metre" || mode === "fixed" ? mode : "stitch"
}

export function defaultPricingMode(shop: ShopType): PricingMode {
  return shop === "tailor" || shop === "boutique" ? "piece" : "stitch"
}

/** How an item's quantity reads: "Qty 2", "2.5 m", "Fixed price". */
export function itemQuantityText(item: { pricing_mode?: string | null; quantity: number }): string {
  const mode = pricingModeOf(item)
  if (mode === "metre") return `${Number(item.quantity)} m`
  if (mode === "fixed") return "Fixed price"
  return `Qty ${Number(item.quantity)}`
}

export interface Vocabulary {
  /** What the product-type field is called. */
  productLabel: string
  designLabel: string
  sizeLabel: string
  sizePlaceholder: string
  /** The extra one-off charge on an item. */
  setupLabel: string
  boardName: string
  inProgressLabel: string
  /** Whether trial/fitting dates make sense for this kind of shop. */
  usesTrialDate: boolean
  /** Whether to ask what material/fabric the customer handed over. */
  usesMaterialReceived: boolean
}

const VOCABULARY: Record<ShopType, Vocabulary> = {
  embroidery: {
    productLabel: "Product Type",
    designLabel: "Design Name/Number",
    sizeLabel: "Size / Placement",
    sizePlaceholder: "e.g. Left Chest 4 inch",
    setupLabel: "Setup/Digitizing Charge",
    boardName: "Production Board",
    inProgressLabel: "In Production",
    usesTrialDate: false,
    usesMaterialReceived: false,
  },
  tailor: {
    productLabel: "Garment",
    designLabel: "Style / Pattern",
    sizeLabel: "Measurements / Size",
    sizePlaceholder: "e.g. Bust 36, Waist 30",
    setupLabel: "Extra Charge (lining, padding…)",
    boardName: "Work Board",
    inProgressLabel: "In Stitching",
    usesTrialDate: true,
    usesMaterialReceived: true,
  },
  boutique: {
    productLabel: "Outfit",
    designLabel: "Design / Style",
    sizeLabel: "Measurements / Size",
    sizePlaceholder: "e.g. Bust 36, Waist 30",
    setupLabel: "Extra Charge (work, lining…)",
    boardName: "Work Board",
    inProgressLabel: "In Work",
    usesTrialDate: true,
    usesMaterialReceived: true,
  },
  mixed: {
    productLabel: "Item Type",
    designLabel: "Design / Style",
    sizeLabel: "Size / Placement",
    sizePlaceholder: "e.g. Left Chest 4 inch, or Bust 36",
    setupLabel: "Setup / Extra Charge",
    boardName: "Work Board",
    inProgressLabel: "In Progress",
    usesTrialDate: true,
    usesMaterialReceived: true,
  },
}

export function vocabularyFor(shop: ShopType): Vocabulary {
  return VOCABULARY[shop]
}

export function useShopType(): ShopType {
  return useBusinessProfile().shopType
}

export function useVocabulary(): Vocabulary {
  return VOCABULARY[useShopType()]
}

// --- Status meaning --------------------------------------------------------
// Shops edit their own status names, but a few have a fixed meaning in the app:
// an order that is Delivered or Cancelled is finished (never "overdue", never
// counted as active), and the statuses where the work is actually being done
// feed the "in progress" count on the Dashboard.

export const TERMINAL_STATUSES = ["Delivered", "Cancelled"]

export const IN_PROGRESS_STATUSES = [
  "In Production",
  "Cutting",
  "Stitching",
  "Trial / Fitting",
  "Alteration",
  "Embroidery / Work",
  "Finishing",
  "Finishing / QC",
]

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function isInProgressStatus(status: string): boolean {
  return IN_PROGRESS_STATUSES.includes(status)
}
