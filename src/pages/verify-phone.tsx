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

type Channel = "sms" | "email"

// Onboarding verification tries Twilio Verify SMS first, and falls back to
// email OTP (Supabase's own signInWithOtp/verifyOtp) whenever the SMS send
// fails — Twilio Verify not configured yet, an unreachable number, a
// carrier or rate-limit failure, etc. Once a channel is picked for this
// screen instance, resend keeps using it rather than re-attempting SMS each
// time, to avoid flip-flopping on a flaky send.
//
// A completed onboarding is still tracked as user_profiles.phone_verified
// (kept as-is rather than renamed, since the subscription trial-start
// trigger already keys off that column — see
// 20260917020000_subscriptions.sql). Each channel proves itself
// differently: the SMS path is verified server-side against Twilio and the
// edge function writes phone_verified directly with the service role key;
// the email path is verified by Supabase Auth itself, and
// mark_self_email_verified() checks the session's JWT for proof that
// verifyOtp() genuinely succeeded before writing it. See
// 20260918000000_email_otp_and_phone_lock.sql. Neither path is a plain
// client-side profile update — that's blocked for non-admins.
export function VerifyPhoneScreen() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [channel, setChannel] = React.useState<Channel | null>(null)
  const [code, setCode] = React.useState("")
  const [verifying, setVerifying] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [cooldown, setCooldown] = React.useState(0)
  const sentOnMount = React.useRef(false)

  React.useEffect(() => {
    const timer = cooldown > 0 ? setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000) : undefined
    return () => clearInterval(timer)
  }, [cooldown])

  const sendEmailCode = React.useCallback(async () => {
    if (!profile?.email) return false
    const { error } = await supabase.auth.signInWithOtp({
      email: profile.email,
      options: { shouldCreateUser: false },
    })
    if (error) {
      setError(error.message)
      return false
    }
    setChannel("email")
    toast.success(`Code sent to ${profile.email}`)
    return true
  }, [profile?.email])

  const sendCode = React.useCallback(async (preferredChannel: Channel | null) => {
    setSending(true)
    setError(null)

    if (preferredChannel !== "email" && profile?.phone) {
      const { data, error } = await supabase.functions.invoke("send-phone-otp")
      if (!error && data?.success) {
        setChannel("sms")
        toast.success(`Code sent to ${data.phone} via SMS`)
        setCooldown(RESEND_COOLDOWN_SECONDS)
        setSending(false)
        return
      }
    }

    const ok = await sendEmailCode()
    if (ok) setCooldown(RESEND_COOLDOWN_SECONDS)
    setSending(false)
  }, [profile?.phone, sendEmailCode])

  React.useEffect(() => {
    if (sentOnMount.current || !profile) return
    sentOnMount.current = true
    void sendCode(null)
  }, [profile, sendCode])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError(null)
    setVerifying(true)

    if (channel === "sms") {
      const { data, error } = await supabase.functions.invoke("verify-phone-otp", { body: { code: code.trim() } })
      if (error) {
        setError(await edgeFunctionErrorMessage(error, "Incorrect code"))
        setVerifying(false)
        return
      }
      if (!data?.success) {
        setError(data?.error || "Incorrect code")
        setVerifying(false)
        return
      }
    } else {
      if (!profile.email) return
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: profile.email,
        token: code.trim(),
        type: "email",
      })
      if (verifyError) {
        setError(verifyError.message || "Incorrect code")
        setVerifying(false)
        return
      }
      const { error: markError } = await supabase.rpc("mark_self_email_verified")
      if (markError) {
        setError("Verified, but finishing setup failed — please try again")
        setVerifying(false)
        return
      }
    }

    toast.success("Verified — welcome aboard!")
    await refreshProfile()
    setVerifying(false)
  }

  const destination = channel === "sms" ? `${profile?.phone} via SMS` : profile?.email || "your email"

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" /> Verify your account
            </CardTitle>
            <CardDescription>
              {channel
                ? `We sent a 6-digit code to ${destination}. Enter it below to finish setting up your account.`
                : "Sending your verification code..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                  disabled={!channel}
                  className="text-center text-lg tracking-[0.3em]"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={verifying || !channel || code.length !== 6}>
                {verifying && <Loader2 className="size-4 animate-spin" />}
                Verify &amp; Continue
              </Button>
              <button
                type="button"
                className="text-center text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                onClick={() => void sendCode(channel)}
                disabled={sending || cooldown > 0}
              >
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </button>
            </form>
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
