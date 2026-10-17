import * as React from "react"
import { Store } from "lucide-react"
import { toast } from "sonner"
import { notify } from "@/lib/notify"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { clearConfigCache } from "@/lib/config"
import { refreshBusinessProfile } from "@/lib/business-profile"
import { SHOP_TYPES, useShopType, type ShopType } from "@/lib/shop-type"
import { cn } from "@/lib/utils"

/**
 * Lets an Administrator say what kind of shop this is. The choice changes the
 * wording and the default way items are priced, and adds that kind of shop's
 * starter lists (statuses, board stages, item types, expense categories …).
 * It only ever adds to what is already there.
 */
export function ShopTypeCard({ onApplied }: { onApplied: () => void }) {
  const current = useShopType()
  const [selected, setSelected] = React.useState<ShopType>(current)
  const [saving, setSaving] = React.useState(false)
  // On by default: choosing a type should mean the order form offers that
  // type's lists, not those plus everything the shop had before.
  const [hideOthers, setHideOthers] = React.useState(true)

  React.useEffect(() => setSelected(current), [current])

  async function apply() {
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc("apply_shop_type", {
        p_shop_type: selected,
        p_replace: false,
        p_hide_others: hideOthers,
      })
      if (error) throw error
      clearConfigCache()
      await refreshBusinessProfile()
      onApplied()
      const added = typeof data === "number" ? data : 0
      notify.success(added > 0 ? `Shop type saved — ${added} list entries updated` : "Shop type saved")
    } catch (err) {
      console.error(err)
      toast.error("Could not change the shop type")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="size-4" /> Shop Type
        </CardTitle>
        <CardDescription>
          Sets the wording, how new items are priced by default, and adds the matching starter lists. Nothing you
          already have is deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SHOP_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={selected === t.value}
              onClick={() => setSelected(t.value)}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors",
                selected === t.value ? "border-primary bg-primary/10" : "hover:bg-accent",
              )}
            >
              <span className="text-sm font-medium">
                {t.label}
                {t.value === current && <span className="ml-2 text-xs font-normal text-muted-foreground">current</span>}
              </span>
              <span className="text-xs text-muted-foreground">{t.description}</span>
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
          <Switch checked={hideOthers} onCheckedChange={setHideOthers} className="mt-0.5" />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Show only this type's lists</span>
            <span className="text-xs text-muted-foreground">
              Hides statuses, board stages, item types, customer types and expense categories that don't belong to
              this type. Nothing is deleted, anything an order, item, customer or expense already uses stays
              visible, and you can switch hidden entries back on under their list.
            </span>
          </span>
        </label>
        <div>
          <Button onClick={apply} disabled={saving}>
            {saving
              ? "Saving..."
              : selected === current
                ? hideOthers
                  ? "Apply again and hide the others"
                  : "Add this type's starter lists again"
                : "Apply shop type"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
