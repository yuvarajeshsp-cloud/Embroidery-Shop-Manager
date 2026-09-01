import * as React from "react"
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { clearConfigCache } from "@/lib/config"
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
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

const CATEGORIES = [
  { key: "order_status", label: "Order Statuses" },
  { key: "payment_status", label: "Payment Statuses" },
  { key: "priority", label: "Priorities" },
  { key: "production_stage", label: "Production Stages" },
  { key: "stage_status", label: "Stage Statuses" },
  { key: "payment_method", label: "Payment Methods" },
  { key: "customer_type", label: "Customer Types" },
  { key: "product_type", label: "Product Types" },
  { key: "operator", label: "Operators" },
]

export function ConfigPage() {
  const [activeCategory, setActiveCategory] = React.useState("order_status")
  const [items, setItems] = React.useState<ConfigItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showAdd, setShowAdd] = React.useState(false)
  const [newName, setNewName] = React.useState("")

  React.useEffect(() => {
    loadItems()
  }, [activeCategory])

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
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader title="Configuration" description="Manage dropdown values and business settings" />

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
          <CardTitle>{activeLabel}</CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
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
              <DialogDescription>Enter a new value for this category</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-2">
              <Label>Value Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. New Status, New Product Type..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
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
