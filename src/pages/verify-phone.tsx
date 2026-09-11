import * as React from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/use-auth"
import { edgeFunctionErrorMessage } from "@/lib/edge-function-error"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

const RESEND_COOLDOWN_SECONDS = 60

export function VerifyPhoneScreen() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [code, setCode] = React.useState("")
  const [verifying, setVerifying] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [cooldown, setCooldown] = React.useState(0)
  const [editingPhone, setEditingPhone] = React.useState(false)
  const [phone, setPhone] = React.useState(profile?.phone || "")
  const sentOnMount = React.useRef(false)

  React.useEffect(() => {
    const timer = cooldown > 0 ? setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000) : undefined
    return () => clearInterval(timer)
  }, [cooldown])

  const sendCode = React.useCallback(async (phoneToUse: string) => {
    setSending(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke("send-signup-otp", { body: { phone: phoneToUse } })
    if (error) {
      setError(await edgeFunctionErrorMessage(error, "Failed to send code"))
    } else if (!data?.success) {
      setError(data?.error || "Failed to send code")
    } else {
      toast.success(`Code sent to ${phoneToUse}`)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    }
    setSending(false)
  }, [])

  React.useEffect(() => {
    if (sentOnMount.current || !profile?.phone) return
    sentOnMount.current = true
    void sendCode(profile.phone)
  }, [profile?.phone, sendCode])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setVerifying(true)
    const { data, error } = await supabase.functions.invoke("verify-signup-otp", { body: { code: code.trim() } })
    if (error) {
      setError(await edgeFunctionErrorMessage(error, "Incorrect code"))
    } else if (!data?.success) {
      setError(data?.error || "Incorrect code")
    } else {
      toast.success("Phone verified — welcome aboard!")
      await refreshProfile()
    }
    setVerifying(false)
  }

  async function handleUpdatePhone() {
    if (!phone.trim() || !profile) return
    const { error } = await supabase.from("user_profiles").update({ phone: phone.trim() }).eq("id", profile.id)
    if (error) {
      toast.error("Failed to update phone number")
      return
    }
    setEditingPhone(false)
    await refreshProfile()
    await sendCode(phone.trim())
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Verify your phone
            </CardTitle>
            <CardDescription>
              {editingPhone
                ? "Enter the correct number and we'll send a new code."
                : `We sent a 6-digit code to ${profile?.phone || "your phone"} on WhatsApp. Enter it below to finish setting up your account.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {editingPhone ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-phone">Phone Number</Label>
                  <Input id="new-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingPhone(false)} disabled={sending}>
                    Cancel
                  </Button>
                  <Button type="button" className="flex-1" onClick={handleUpdatePhone} disabled={sending || !phone.trim()}>
                    {sending && <Loader2 className="size-4 animate-spin" />}
                    Save &amp; Send Code
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleVerify} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="otp-code">Verification Code</Label>
                  <Input
                    id="otp-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                    className="text-center text-lg tracking-[0.3em]"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={verifying || code.length !== 6}>
                  {verifying && <Loader2 className="size-4 animate-spin" />}
                  Verify &amp; Continue
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                    onClick={() => profile?.phone && sendCode(profile.phone)}
                    disabled={sending || cooldown > 0}
                  >
                    {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setEditingPhone(true)}
                  >
                    Wrong number?
                  </button>
                </div>
              </form>
            )}
            <button
              type="button"
              className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
