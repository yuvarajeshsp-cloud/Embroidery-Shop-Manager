import * as React from "react"
import { Loader2, User as UserIcon, KeyRound } from "lucide-react"

import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { logAudit } from "@/lib/audit"
import { formatDateTime } from "@/lib/helpers"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

const roleColors: Record<string, string> = {
  Administrator: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Operator: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Accounts: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
}

export function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = React.useState(profile?.display_name || "")
  const [phone, setPhone] = React.useState(profile?.phone || "")
  const [saving, setSaving] = React.useState(false)

  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [changingPassword, setChangingPassword] = React.useState(false)

  React.useEffect(() => {
    setDisplayName(profile?.display_name || "")
    setPhone(profile?.phone || "")
  }, [profile?.display_name, profile?.phone])

  const dirty = displayName !== (profile?.display_name || "") || phone !== (profile?.phone || "")

  async function handleSaveProfile() {
    if (!profile) return
    if (!displayName.trim()) {
      toast.error("Display name is required")
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          display_name: displayName.trim(),
          phone: phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id)
      if (error) throw error
      await logAudit(
        profile,
        "user_profiles",
        profile.id,
        "UPDATE",
        { display_name: profile.display_name, phone: profile.phone } as Record<string, unknown>,
        { display_name: displayName.trim(), phone: phone.trim() || null } as Record<string, unknown>,
      )
      toast.success("Profile updated")
      await refreshProfile()
    } catch (err) {
      console.error(err)
      toast.error("Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success("Password changed")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Failed to change password")
    } finally {
      setChangingPassword(false)
    }
  }

  if (!profile) {
    return <PageLoader />
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="My Profile" description="Your account details and preferences" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="size-4" /> Account Information
            </CardTitle>
            <CardDescription>Update your name and contact number</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Display Name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Email</Label>
              <Input value={profile.email || user?.email || ""} disabled />
              <p className="text-xs text-muted-foreground">Email is managed by sign-in and can't be changed here.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Role</span>
              <Badge variant="outline" className={roleColors[profile.role] || ""}>{profile.role}</Badge>
              <span className="text-xs text-muted-foreground">
                {profile.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Role and active status are set by an Administrator on the Users & Roles page.
            </p>
            <p className="text-xs text-muted-foreground">Member since {formatDateTime(profile.created_at)}</p>
            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={saving || !dirty}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Change Password
            </CardTitle>
            <CardDescription>Choose a new password for your account</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleChangePassword}
                disabled={changingPassword || !newPassword || !confirmPassword}
              >
                {changingPassword && <Loader2 className="size-4 animate-spin" />}
                Update Password
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
