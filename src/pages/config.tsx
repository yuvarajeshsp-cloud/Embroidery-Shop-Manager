import * as React from "react"
import { Plus, Trash2, ArrowUp, ArrowDown, Building2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { BUSINESS_PROFILE_FIELDS, PRODUCTION_BOARD_STAGE_CATEGORY, clearConfigCache, fetchBusinessSettings, saveBusinessSettings, setDocumentTitleFromSettings } from "@/lib/config"
import type { ConfigItem } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

const PRODUCTION_BOARD_CATEGORY = PRODUCTION_BOARD_STAGE_CATEGORY

const CATEGORIES = [
  { key: "order_status", label: "Order Statuses" },
  { key: PRODUCTION_BOARD_CATEGORY, label: "Production Stages" },
  { key: "payment_status", label: "Payment Statuses" },
  { key: "priority", label: "Priorities" },
  { key: "payment_method", label: "Payment Methods" },
  { key: "customer_type", label: "Customer Types" },
  { key: "product_type", label: "Product Types" },
  { key: "sales_channel", label: "Sales Channels" },
]

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  [PRODUCTION_BOARD_CATEGORY]:
    "Pick which order statuses show up as columns on the Production Board, and in what order. Manage the full status list itself under Order Statuses.",
}

const profileFields = [
  { key: "company_name", label: "Company Name" },
  { key: "company_tagline", label: "Tagline" },
  { key: "company_email", label: "Business Email" },
  { key: "company_phone", label: "Phone" },
  { key: "company_website", label: "Website" },
  { key: "company_gst_number", label: "GST Number" },
  { key: "company_address", label: "Address" },
  { key: "company_city", label: "City" },
  { key: "company_state", label: "State" },
  { key: "company_pincode", label: "Pincode" },
] as const

export function ConfigPage() {
  const [activeCategory, setActiveCategory] = React.useState("order_status")
  const [items, setItems] = React.useState<ConfigItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showAdd, setShowAdd] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [profile, setProfile] = React.useState<Record<string, string>>({})
  const [savingProfile, setSavingProfile] = React.useState(false)
  const [orderStatusNames, setOrderStatusNames] = React.useState<string[]>([])

  const isProductionBoardCategory = activeCategory === PRODUCTION_BOARD_CATEGORY

  React.useEffect(() => {
    loadItems()
    loadBusinessProfile()
    if (activeCategory === PRODUCTION_BOARD_CATEGORY) loadOrderStatusNames()
  }, [activeCategory])

  async function loadOrderStatusNames() {
    const { data } = await supabase
      .from("config_items")
      .select("name")
      .eq("category", "order_status")
      .order("sort_order")
    setOrderStatusNames((data || []).map((r: { name: string }) => r.name))
  }

  async function loadBusinessProfile() {
    const settings = await fetchBusinessSettings()
    const nextProfile: Record<string, string> = {}
    for (const field of BUSINESS_PROFILE_FIELDS) {
      nextProfile[field] = settings[field] || ""
    }
    setProfile(nextProfile)
  }

  async function handleSaveProfile() {
    setSavingProfile(true)
    try {
      await saveBusinessSettings(profile)
      setDocumentTitleFromSettings(profile)
      toast.success("Business profile saved")
    } catch (error) {
      console.error(error)
      toast.error("Failed to save business profile")
    } finally {
      setSavingProfile(false)
    }
  }

  function handleProfileChange(key: string, value: string) {
    setProfile((current) => ({ ...current, [key]: value }))
  }

  function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      setProfile((current) => ({ ...current, company_logo_data_url: result }))
    }
    reader.readAsDataURL(file)
  }

  async function loadItems() {
    setLoading(true)
    clearConfigCache()
    const { data, error } = await supabase
      .from("config_items")
      .select("*")
      .eq("category", activeCategory)
      .order("sort_order")
    if (error) {
      toast.error("Failed to load config items")
    } else {
      setItems(data || [])
    }
    setLoading(false)
  }

  async function handleAdd() {
    if (!newName.trim()) {
      toast.error("Name is required")
      return
    }
    const maxSort = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) : 0
    const { error } = await supabase.from("config_items").insert({
      category: activeCategory,
      name: newName.trim(),
      sort_order: maxSort + 1,
      is_active: true,
    })
    if (error) {
      if (error.code === "23505") {
        toast.error("This value already exists")
      } else {
        toast.error("Failed to add item")
      }
    } else {
      toast.success("Item added")
      setNewName("")
      setShowAdd(false)
      loadItems()
    }
  }

  async function handleToggleActive(item: ConfigItem) {
    const { error } = await supabase
      .from("config_items")
      .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
      .eq("id", item.id)
    if (error) {
      toast.error("Failed to update")
    } else {
      loadItems()
    }
  }

  async function handleMove(item: ConfigItem, direction: "up" | "down") {
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((i) => i.id === item.id)
    if (direction === "up" && idx === 0) return
    if (direction === "down" && idx === sorted.length - 1) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    const swapItem = sorted[swapIdx]
    await Promise.all([
      supabase.from("config_items").update({ sort_order: swapItem.sort_order, updated_at: new Date().toISOString() }).eq("id", item.id),
      supabase.from("config_items").update({ sort_order: item.sort_order, updated_at: new Date().toISOString() }).eq("id", swapItem.id),
    ])
    loadItems()
  }

  async function handleDelete(item: ConfigItem) {
    if (!confirm(`Delete "${item.name}"? Existing orders will keep their values but this option won't appear for new entries.`)) return
    const { error } = await supabase.from("config_items").delete().eq("id", item.id)
    if (error) {
      toast.error("Failed to delete")
    } else {
      toast.success("Item deleted")
      loadItems()
    }
  }

  const activeLabel = CATEGORIES.find((c) => c.key === activeCategory)?.label || ""

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Configuration" description="Manage dropdown values and business settings" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" /> Business Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="md:col-span-2 xl:col-span-3 flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border bg-background">
                {profile.company_logo_data_url ? (
                  <img src={profile.company_logo_data_url} alt="Company logo" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-logo-upload">Company Logo</Label>
                <div className="flex items-center gap-2">
                  <Input id="company-logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="max-w-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setProfile((current) => ({ ...current, company_logo_data_url: "" }))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>

            {profileFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  value={profile[field.key] || ""}
                  onChange={(e) => handleProfileChange(field.key, e.target.value)}
                  placeholder={field.label}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save Business Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Button
            key={c.key}
            variant={activeCategory === c.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(c.key)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{activeLabel}</CardTitle>
            {CATEGORY_DESCRIPTIONS[activeCategory] && (
              <p className="mt-1 text-sm text-muted-foreground">{CATEGORY_DESCRIPTIONS[activeCategory]}</p>
            )}
          </div>
          <Button size="sm" onClick={() => { setNewName(""); setShowAdd(true) }}>
            <Plus className="size-4" /> Add Value
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No items configured</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Order</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-xs" onClick={() => handleMove(item, "up")} disabled={idx === 0}>
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => handleMove(item, "down")} disabled={idx === items.length - 1}>
                          <ArrowDown className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={() => handleToggleActive(item)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {item.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(item)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showAdd && (
        <Dialog open onOpenChange={() => setShowAdd(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add {activeLabel}</DialogTitle>
              <DialogDescription>
                {isProductionBoardCategory
                  ? "Choose an order status to show as a column on the Production Board"
                  : "Enter a new value for this category"}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-2">
              {isProductionBoardCategory ? (
                <>
                  <Label>Order Status</Label>
                  <Select value={newName} onValueChange={setNewName}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select a status..." /></SelectTrigger>
                    <SelectContent>
                      {orderStatusNames
                        .filter((name) => !items.some((i) => i.name === name))
                        .map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {orderStatusNames.filter((name) => !items.some((i) => i.name === name)).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      All order statuses are already on the board. Add more under Order Statuses first.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Label>Value Name</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. New Status, New Product Type..."
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
