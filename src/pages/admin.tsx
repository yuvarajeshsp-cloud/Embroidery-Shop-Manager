import * as React from "react"
import { Plus, Shield } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
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

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Users & Roles" description="Manage team members and their permissions">
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
    </div>
  )
}

export function AuditPage() {
  const isMobile = useIsMobile()
  const [logs, setLogs] = React.useState<AuditLog[]>([])
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
    }
    setLoading(false)
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
                      <span className="font-mono">{log.record_id.substring(0, 8)}...</span>
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
                    <TableCell className="font-mono text-xs">{log.record_id.substring(0, 8)}...</TableCell>
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
