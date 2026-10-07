import * as React from "react"
import { Loader2, UserX } from "lucide-react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { usePlatformAdmin } from "@/lib/platform-admin"
import { edgeFunctionErrorMessage } from "@/lib/edge-function-error"
import { clearBiometricCredentials } from "@/lib/biometric-credentials"
import { setBiometricUnlockEnabled } from "@/lib/biometric-unlock"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"

type Scenario = { kind: "leave" } | { kind: "whole-shop" } | { kind: "blocked" }

/**
 * Permanent account deletion, required by Google Play / the App Store for
 * apps with in-app sign-up. The server (delete-account edge function) makes
 * the real decision; this only explains, in advance, which of the three
 * outcomes the person is about to get.
 */
export function DeleteAccountCard() {
  const { profile } = useAuth()
  const isPlatformAdmin = usePlatformAdmin()
  const [open, setOpen] = React.useState(false)
  const [scenario, setScenario] = React.useState<Scenario | null>(null)
  const [confirmText, setConfirmText] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  if (!profile || isPlatformAdmin !== false) return null

  async function handleOpen() {
    const { data } = await supabase.from("user_profiles").select("id, role, is_active")
    const others = (data || []).filter((m) => m.id !== profile!.id)
    const otherAdmins = others.filter((m) => m.role === "Administrator" && m.is_active)
    if (profile!.role === "Administrator" && others.length > 0 && otherAdmins.length === 0) {
      setScenario({ kind: "blocked" })
    } else if (others.length === 0) {
      setScenario({ kind: "whole-shop" })
    } else {
      setScenario({ kind: "leave" })
    }
    setConfirmText("")
    setOpen(true)
  }

  async function handleDelete() {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirm: "DELETE" } })
    if (error || !data?.success) {
      toast.error(error ? await edgeFunctionErrorMessage(error, "Failed to delete account") : data?.error || "Failed to delete account")
      setBusy(false)
      return
    }
    await clearBiometricCredentials()
    await setBiometricUnlockEnabled(false)
    await supabase.auth.signOut({ scope: "local" })
    toast.success("Your account has been deleted")
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <UserX className="size-4" /> Delete Account
          </CardTitle>
          <CardDescription>Permanently delete your account and personal information</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <Button variant="destructive" onClick={handleOpen}>
            Delete my account
          </Button>
        </CardContent>
      </Card>

      {open && scenario && (
        <Dialog open onOpenChange={(o) => !busy && setOpen(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                {scenario.kind === "blocked" &&
                  "You're the only Administrator and your shop still has other team members. Make someone else an Administrator on the Users & Roles page (or remove the other members) first, then come back here."}
                {scenario.kind === "leave" &&
                  "Your account, name, email and phone number will be permanently deleted. The shop's orders, customers and payments stay, but your name is removed from them. This can't be undone."}
                {scenario.kind === "whole-shop" &&
                  "You're the only member of this shop, so deleting your account also permanently deletes the shop and everything in it — all orders, customers, payments, expenses and uploaded files. This can't be undone."}
              </DialogDescription>
            </DialogHeader>
            {scenario.kind !== "blocked" && (
              <div className="flex flex-col gap-2 py-2">
                <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
                <Input
                  id="delete-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                {scenario.kind === "blocked" ? "Close" : "Cancel"}
              </Button>
              {scenario.kind !== "blocked" && (
                <Button variant="destructive" onClick={handleDelete} disabled={busy || confirmText !== "DELETE"}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Permanently delete
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
