import * as React from "react"
import { Search, Plus, Pencil, Trash2, Download, Lock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { formatCurrency, formatDate, generateExpenseNumber } from "@/lib/helpers"
import type { Expense, Order } from "@/lib/types"
import type { ExportField } from "@/lib/export"
import { computeDateRange, isWithinRange, type DateRangePreset } from "@/lib/date-range"
import { OrderInfoButton } from "@/components/info-card"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ExpenseCategoryBadge } from "@/components/status-badges"
import { useRouter } from "@/lib/router"
import { useIsMobile } from "@/hooks/use-mobile"
import { fetchConfigItems } from "@/lib/config"
import { toast } from "sonner"
import { notify } from "@/lib/notify"
import { MultiSelectFilter } from "@/components/multi-select-filter"
import { DateRangeFilter } from "@/components/date-range-filter"
import { ExportDialog } from "@/components/export-dialog"

type EnrichedExpense = Expense & { order?: Order }

export function ExpensesPage() {
  const { navigate } = useRouter()
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [expenses, setExpenses] = React.useState<EnrichedExpense[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState<Set<string>>(new Set())
  const [categories, setCategories] = React.useState<{ name: string; is_sensitive: boolean }[]>([])
  const [datePreset, setDatePreset] = React.useState<DateRangePreset>("all_time")
  const [customFrom, setCustomFrom] = React.useState("")
  const [customTo, setCustomTo] = React.useState("")
  const [showExport, setShowExport] = React.useState(false)
  const [showForm, setShowForm] = React.useState(false)
  const [editing, setEditing] = React.useState<Expense | null>(null)

  const isAdmin = profile?.role === "Administrator"
  const canManage = isAdmin || profile?.role === "Manager" || profile?.role === "Accounts"
  const visibleCategories = categories.filter((c) => !c.is_sensitive || isAdmin)

  React.useEffect(() => {
    fetchConfigItems("expense_category").then((items) => setCategories(items.map((i) => ({ name: i.name, is_sensitive: i.is_sensitive }))))
    loadExpenses()
  }, [])

  async function loadExpenses() {
    // Reloading after a save keeps the page as it is; the spinner is only for the first load.
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })

    if (!data) { setLoading(false); return }

    const orderIds = [...new Set(data.map((e: Expense) => e.order_id).filter(Boolean))] as string[]
    const { data: orders } = orderIds.length
      ? await supabase.from("orders").select("*").in("id", orderIds)
      : { data: [] as Order[] }
    const orderMap = new Map((orders || []).map((o: Order) => [o.id, o]))

    setExpenses(data.map((e: Expense) => ({ ...e, order: e.order_id ? orderMap.get(e.order_id) : undefined })))
    setLoading(false)
  }

  async function handleDelete(expense: Expense) {
    if (!confirm(`Delete expense "${expense.expense_number}"?`)) return
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id)
    if (error) {
      toast.error("Failed to delete expense")
    } else {
      await logAudit(profile, "expenses", expense.id, "DELETE", expense as unknown as Record<string, unknown>, null)
      notify.success("Expense deleted")
      loadExpenses()
    }
  }

  const dateRange = computeDateRange(datePreset, customFrom, customTo)

  const filtered = expenses.filter((e) => {
    const matchesSearch =
      !search ||
      e.expense_number.toLowerCase().includes(search.toLowerCase()) ||
      (e.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.order?.order_number || "").toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter.size === 0 || categoryFilter.has(e.category)
    const matchesDate = isWithinRange(e.expense_date, dateRange)
    return matchesSearch && matchesCategory && matchesDate
  })

  const filteredTotal = filtered.reduce((sum, e) => sum + e.amount, 0)

  const expenseExportFields: ExportField<EnrichedExpense>[] = [
    { key: "expense_number", label: "Expense Number", value: (e) => e.expense_number },
    { key: "expense_date", label: "Date", value: (e) => formatDate(e.expense_date) },
    { key: "category", label: "Category", value: (e) => e.category },
    { key: "amount", label: "Amount", value: (e) => e.amount },
    { key: "order_number", label: "Linked Order", value: (e) => e.order?.order_number || "" },
    { key: "description", label: "Description", value: (e) => e.description || "" },
  ]

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Expenses" description="Track shop expenses, salary, rent, and bills">
        <Button variant="outline" size="sm" onClick={() => setShowExport(true)}>
          <Download className="size-4" /> <span className="hidden sm:inline">Export</span>
        </Button>
        {canManage && (
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Add Expense</span>
            <span className="sm:hidden">Expense</span>
          </Button>
        )}
      </PageHeader>

      <Card className="w-fit min-w-[180px]">
        <CardContent className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">Total (filtered)</span>
          <span className="text-2xl font-bold tracking-tight">{formatCurrency(filteredTotal)}</span>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by expense #, order, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MultiSelectFilter
          label="Category"
          options={visibleCategories.map((c) => ({ value: c.name, label: c.name }))}
          selected={categoryFilter}
          onChange={setCategoryFilter}
          className="w-full sm:w-auto"
        />
        <DateRangeFilter
          preset={datePreset}
          onPresetChange={setDatePreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <PageLoader size="sm" />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No expenses found</div>
          ) : isMobile ? (
            <div className="flex flex-col divide-y">
              {filtered.map((e) => (
                <div key={e.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm">{e.expense_number}</span>
                    <span className="font-semibold">{formatCurrency(e.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    {e.order ? (
                      <button
                        className="font-mono text-xs text-primary hover:underline"
                        onClick={() => navigate({ name: "order-detail", id: e.order!.id })}
                      >
                        {e.order.order_number}
                      </button>
                    ) : <span className="text-xs">—</span>}
                    <span>{formatDate(e.expense_date)}</span>
                  </div>
                  {e.description && <div className="text-sm text-muted-foreground">{e.description}</div>}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <ExpenseCategoryBadge category={e.category} />
                      {e.is_sensitive && <Lock className="size-3 text-muted-foreground" />}
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(e); setShowForm(true) }}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(e)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expense #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.expense_number}</TableCell>
                    <TableCell className="text-sm">{formatDate(e.expense_date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <ExpenseCategoryBadge category={e.category} />
                        {e.is_sensitive && <Lock className="size-3 text-muted-foreground" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      {e.order ? (
                        <button
                          className="font-mono text-xs text-primary hover:underline"
                          onClick={() => navigate({ name: "order-detail", id: e.order!.id })}
                        >
                          {e.order.order_number}
                        </button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{e.description || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(e.amount)}</TableCell>
                    <TableCell>
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(e); setShowForm(true) }}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(e)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <ExpenseForm
          expense={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadExpenses() }}
        />
      )}

      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        title="Export Expenses"
        filename="expenses"
        sheetName="Expenses"
        rows={filtered}
        fields={expenseExportFields}
      />
    </div>
  )
}

export function ExpenseForm({
  expense,
  orderId,
  onClose,
  onSaved,
}: {
  expense: Expense | null
  /** Pre-selects the linked order (e.g. when adding from an order page). */
  orderId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === "Administrator"
  const [saving, setSaving] = React.useState(false)
  const [categories, setCategories] = React.useState<string[]>([])
  const [orders, setOrders] = React.useState<Order[]>([])
  const [selectedOrderId, setSelectedOrderId] = React.useState(expense?.order_id || orderId || "")
  const [form, setForm] = React.useState({
    expense_number: expense?.expense_number || generateExpenseNumber(),
    expense_date: expense?.expense_date || new Date().toISOString().split("T")[0],
    category: expense?.category || "",
    amount: expense?.amount || 0,
    description: expense?.description || "",
  })

  React.useEffect(() => {
    fetchConfigItems("expense_category").then((items) => {
      // Restricted categories (like Salary) are Administrator-only — a
      // Manager/Accounts user creating or editing an expense should never
      // even be offered the option, not just get blocked by RLS after the
      // fact with a confusing error.
      const visible = items.filter((i) => !i.is_sensitive || isAdmin)
      setCategories(visible.map((i) => i.name))
      setForm((f) => (f.category ? f : { ...f, category: visible[0]?.name || "" }))
    })
    supabase.from("orders").select("*").order("order_date", { ascending: false }).then(({ data }) => setOrders(data || []))
  }, [isAdmin])

  async function handleSave() {
    if (!form.category) {
      toast.error("Please select a category")
      return
    }
    if (!form.amount || form.amount <= 0) {
      toast.error("Amount must be greater than 0")
      return
    }
    setSaving(true)
    try {
      const payload = {
        expense_number: form.expense_number,
        expense_date: form.expense_date,
        category: form.category,
        amount: form.amount,
        description: form.description || null,
        order_id: selectedOrderId || null,
        updated_by: profile?.id,
      }
      if (expense) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", expense.id)
        if (error) throw error
        await logAudit(profile, "expenses", expense.id, "UPDATE", null, payload as unknown as Record<string, unknown>)
        notify.success("Expense updated")
      } else {
        const { data, error } = await supabase.from("expenses").insert({ ...payload, created_by: profile?.id }).select("id").single()
        if (error) throw error
        await logAudit(profile, "expenses", data.id, "INSERT", null, payload as unknown as Record<string, unknown>)
        notify.success("Expense recorded")
      }
      onSaved()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Failed to save expense")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Expense" : "Add Expense"}</DialogTitle>
          <DialogDescription>Optionally link it to an order to include it in that order's costs</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={Number.isNaN(form.amount) ? "" : form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? NaN : parseFloat(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Linked Order (optional)</Label>
              <div className="flex items-center gap-1">
                <Select value={selectedOrderId || "none"} onValueChange={(v) => setSelectedOrderId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No order" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No order</SelectItem>
                    {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.order_number}</SelectItem>)}
                  </SelectContent>
                </Select>
                <OrderInfoButton orderId={selectedOrderId} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
