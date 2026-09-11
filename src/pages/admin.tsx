import * as React from "react"
import { Plus, Shield, UserPlus } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { useRouter } from "@/lib/router"
import { logAudit } from "@/lib/audit"
import { formatDateTime } from "@/lib/helpers"
import type { UserProfile, UserRole, AuditLog } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
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
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useIsMobile } from "@/hooks/use-mobile"
import { toast } from "sonner"

const ROLES: UserRole[] = ["Administrator", "Manager", "Operator", "Accounts"]

const roleColors: Record<string, string> = {
  Administrator: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Operator: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Accounts: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
}

export function UsersPage() {
  const isMobile = useIsMobile()
  const { profile: currentUser } = useAuth()
  const [users, setUsers] = React.useState<UserProfile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteName, setInviteName] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<UserRole>("Operator")
  const [inviting, setInviting] = React.useState(false)
  const [showCreateForm, setShowCreateForm] = React.useState(false)
  const [createEmail, setCreateEmail] = React.useState("")
  const [createName, setCreateName] = React.useState("")
  const [createRole, setCreateRole] = React.useState<UserRole>("Operator")
  const [createPassword, setCreatePassword] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    const { data, error } = await supabase.from("user_profiles").select("*").order("display_name")
    if (error) {
      toast.error("Failed to load users")
    } else {
      setUsers(data || [])
    }
    setLoading(false)
  }

  async function handleToggleActive(user: UserProfile) {
    const { error } = await supabase
      .from("user_profiles")
      .update({ is_active: !user.is_active, updated_at: new Date().toISOString() })
      .eq("id", user.id)
    if (error) {
      toast.error("Failed to update user")
    } else {
      await logAudit(currentUser, "user_profiles", user.id, "UPDATE", { is_active: user.is_active } as Record<string, unknown>, { is_active: !user.is_active } as Record<string, unknown>)
      toast.success("User updated")
      loadUsers()
    }
  }

  async function handleRoleChange(user: UserProfile, role: UserRole) {
    const { error } = await supabase
      .from("user_profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", user.id)
    if (error) {
      toast.error("Failed to update role")
    } else {
      await logAudit(currentUser, "user_profiles", user.id, "UPDATE", { role: user.role } as Record<string, unknown>, { role } as Record<string, unknown>)
      toast.success("Role updated")
      loadUsers()
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      toast.error("Name and email are required")
      return
    }
    setInviting(true)
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: inviteEmail.trim(),
          display_name: inviteName.trim(),
          role: inviteRole,
        },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || "Failed to send invite")

      await logAudit(currentUser, "user_profiles", data.user_id, "INSERT", null, { email: inviteEmail.trim(), role: inviteRole } as Record<string, unknown>, "Invited")
      toast.success(`Invite sent to ${inviteEmail.trim()}`)
      setInviteEmail("")
      setInviteName("")
      setInviteRole("Operator")
      setShowForm(false)
      loadUsers()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Failed to send invite")
    } finally {
      setInviting(false)
    }
  }

  async function handleCreateUser() {
    if (!createEmail.trim() || !createName.trim()) {
      toast.error("Name and email are required")
      return
    }
    if (createPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }
    setCreating(true)
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: createEmail.trim(),
          display_name: createName.trim(),
          role: createRole,
          password: createPassword,
        },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || "Failed to create user")

      await logAudit(currentUser, "user_profiles", data.user_id, "INSERT", null, { email: createEmail.trim(), role: createRole } as Record<string, unknown>, "Created directly")
      toast.success(`${createName.trim()} can now sign in`)
      setCreateEmail("")
      setCreateName("")
      setCreateRole("Operator")
      setCreatePassword("")
      setShowCreateForm(false)
      loadUsers()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Failed to create user")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Users & Roles" description="Manage team members and their permissions">
        <Button variant="outline" size="sm" onClick={() => setShowCreateForm(true)}>
          <UserPlus className="size-4" /> Create User
        </Button>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4" /> Invite User
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <PageLoader size="sm" />
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No users found</div>
          ) : isMobile ? (
            <div className="flex flex-col divide-y">
              {users.map((u) => (
                <div key={u.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {u.display_name}
                      {u.id === currentUser?.id && <span className="ml-2 text-xs text-muted-foreground">(You)</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={u.is_active}
                        onCheckedChange={() => handleToggleActive(u)}
                        disabled={u.id === currentUser?.id}
                      />
                      <span className="text-xs text-muted-foreground">
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{u.email}</div>
                  <div className="text-sm text-muted-foreground">{u.phone || "—"}</div>
                  <div className="flex items-center justify-between gap-2">
                    {u.id === currentUser?.id ? (
                      <Badge variant="outline" className={roleColors[u.role] || ""}>{u.role}</Badge>
                    ) : (
                      <Select value={u.role} onValueChange={(v) => handleRoleChange(u, v as UserRole)}>
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDateTime(u.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.display_name}
                      {u.id === currentUser?.id && <span className="ml-2 text-xs text-muted-foreground">(You)</span>}
                    </TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell className="text-sm">{u.phone || "—"}</TableCell>
                    <TableCell>
                      {u.id === currentUser?.id ? (
                        <Badge variant="outline" className={roleColors[u.role] || ""}>{u.role}</Badge>
                      ) : (
                        <Select value={u.role} onValueChange={(v) => handleRoleChange(u, v as UserRole)}>
                          <SelectTrigger className="h-7 w-[140px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.is_active}
                          onCheckedChange={() => handleToggleActive(u)}
                          disabled={u.id === currentUser?.id}
                        />
                        <span className="text-xs text-muted-foreground">
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(u.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Role descriptions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => (
          <Card key={role}>
            <CardHeader className="flex-row items-center gap-2">
              <Shield className="size-4" />
              <CardTitle className="text-sm">{role}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {role === "Administrator" && "Full access to all modules, configuration, and user management."}
                {role === "Manager" && "Can manage orders, customers, payments, and production. No config access."}
                {role === "Operator" && "Production-focused access — can view orders and update production stages."}
                {role === "Accounts" && "Financial access — payments, reports, and customer billing."}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Sends an email invite with a sign-in link. Their account is created with the role you pick below —
                they won't need to self sign-up.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col gap-2">
                <Label>Name</Label>
                <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} disabled={inviting} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Email</Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} disabled={inviting} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)} disabled={inviting}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={inviting}>Cancel</Button>
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting ? "Sending..." : "Send Invite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showCreateForm && (
        <Dialog open onOpenChange={() => setShowCreateForm(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>
                Creates the account immediately with the password you set below — no invite email is sent, and they
                can sign in right away.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col gap-2">
                <Label>Name</Label>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} disabled={creating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Email</Label>
                <Input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} disabled={creating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  disabled={creating}
                  minLength={6}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <Select value={createRole} onValueChange={(v) => setCreateRole(v as UserRole)} disabled={creating}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateForm(false)} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreateUser} disabled={creating}>
                {creating ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

interface RecordRef {
  label: string
  onOpen?: () => void
}

async function fetchByIds<T>(table: string, ids: string[], columns: string): Promise<T[]> {
  if (ids.length === 0) return []
  const { data } = await supabase.from(table).select(columns).in("id", ids)
  return (data || []) as T[]
}

export function AuditPage() {
  const isMobile = useIsMobile()
  const { navigate } = useRouter()
  const [logs, setLogs] = React.useState<AuditLog[]>([])
  const [recordRefs, setRecordRefs] = React.useState<Record<string, RecordRef>>({})
  const [loading, setLoading] = React.useState(true)
  const [tableFilter, setTableFilter] = React.useState("all")

  React.useEffect(() => {
    loadLogs()
  }, [])

  async function loadLogs() {
    setLoading(true)
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(200)
    if (error) {
      toast.error("Failed to load audit logs")
    } else {
      setLogs(data || [])
      await loadRecordRefs(data || [])
    }
    setLoading(false)
  }

  // Audit entries only store a table name + a raw record id. Resolve each
  // one into a human-readable label (order number, customer name, ...) and,
  // where the app has an actual detail page for that kind of record, a way
  // to jump straight to it — instead of showing the opaque backend id.
  async function loadRecordRefs(entries: AuditLog[]) {
    const idsFor = (table: string) => [...new Set(entries.filter((l) => l.table_name === table).map((l) => l.record_id))]

    const [orders, customers, payments, users] = await Promise.all([
      fetchByIds<{ id: string; order_number: string }>("orders", idsFor("orders"), "id, order_number"),
      fetchByIds<{ id: string; customer_business_name: string }>("customers", idsFor("customers"), "id, customer_business_name"),
      fetchByIds<{ id: string; payment_number: string; order_id: string }>("payments", idsFor("payments"), "id, payment_number, order_id"),
      fetchByIds<{ id: string; display_name: string; email: string }>("user_profiles", idsFor("user_profiles"), "id, display_name, email"),
    ])

    const refs: Record<string, RecordRef> = {}
    for (const o of orders) {
      refs[`orders:${o.id}`] = { label: o.order_number, onOpen: () => navigate({ name: "order-detail", id: o.id }) }
    }
    for (const c of customers) {
      refs[`customers:${c.id}`] = { label: c.customer_business_name, onOpen: () => navigate({ name: "customer-detail", id: c.id }) }
    }
    for (const p of payments) {
      refs[`payments:${p.id}`] = { label: p.payment_number, onOpen: () => navigate({ name: "order-detail", id: p.order_id }) }
    }
    for (const u of users) {
      refs[`user_profiles:${u.id}`] = { label: u.display_name || u.email }
    }
    setRecordRefs(refs)
  }

  function RecordCell({ log }: { log: AuditLog }) {
    const ref = recordRefs[`${log.table_name}:${log.record_id}`]
    if (!ref) {
      return <span className="font-mono text-xs text-muted-foreground">{log.record_id.substring(0, 8)}...</span>
    }
    if (ref.onOpen) {
      return (
        <button type="button" onClick={ref.onOpen} className="text-xs font-medium text-primary hover:underline">
          {ref.label}
        </button>
      )
    }
    return <span className="text-xs">{ref.label}</span>
  }

  const tables = [...new Set(logs.map((l) => l.table_name))]
  const filtered = tableFilter === "all" ? logs : logs.filter((l) => l.table_name === tableFilter)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Audit Log" description="Immutable record of all changes" />

      <div className="flex gap-2">
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Tables" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tables</SelectItem>
            {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <PageLoader size="sm" />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No audit entries yet</div>
          ) : isMobile ? (
            <div className="flex flex-col divide-y">
              {filtered.map((log) => {
                const actionClass =
                  log.action === "INSERT" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" :
                  log.action === "UPDATE" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" :
                  log.action === "DELETE" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : ""
                return (
                  <div key={log.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">{log.table_name}</Badge>
                        <Badge variant="outline" className={actionClass}>{log.action}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDateTime(log.changed_at)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{log.user_name || "—"}</div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <RecordCell log={log} />
                      {log.reason && <span>{log.reason}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record ID</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.changed_at)}</TableCell>
                    <TableCell className="text-sm">{log.user_name || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{log.table_name}</Badge></TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          log.action === "INSERT" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" :
                          log.action === "UPDATE" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" :
                          log.action === "DELETE" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : ""
                        }
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell><RecordCell log={log} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.reason || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
