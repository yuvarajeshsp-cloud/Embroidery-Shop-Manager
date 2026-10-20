import * as React from "react"
import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { notify } from "@/lib/notify"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  fetchPlatformSettings,
  createRazorpaySubscription,
  verifyRazorpayPayment,
  loadRazorpayCheckout,
  formatRupees,
} from "@/lib/subscription"
import type { PlatformSettings } from "@/lib/types"
import { useAuth } from "@/lib/use-auth"
import { APP_NAME } from "@/lib/app-info"

/** Monthly/yearly plan cards with Razorpay checkout — shared between the normal Subscription page and the full-screen paywall. */
export function PlanPicker({ onSubscribed }: { onSubscribed: () => void }) {
  const { profile, user } = useAuth()
  const [settings, setSettings] = React.useState<PlatformSettings | null>(null)
  const [busyCycle, setBusyCycle] = React.useState<"monthly" | "yearly" | null>(null)

  React.useEffect(() => {
    void fetchPlatformSettings().then(setSettings)
  }, [])

  const isAdministrator = profile?.role === "Administrator"
  const monthly = settings?.monthly_price_paise ?? 0
  const yearly = monthly * 10

  async function handleSubscribe(cycle: "monthly" | "yearly") {
    setBusyCycle(cycle)
    try {
      const { razorpay_subscription_id, razorpay_key_id } = await createRazorpaySubscription(cycle)
      await loadRazorpayCheckout()

      const checkout = new window.Razorpay!({
        key: razorpay_key_id,
        subscription_id: razorpay_subscription_id,
        name: APP_NAME,
        description: cycle === "monthly" ? "Monthly subscription" : "Yearly subscription",
        prefill: { name: profile?.display_name, email: profile?.email || user?.email },
        theme: { color: "#6366f1" },
        handler: async (response: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          try {
            await verifyRazorpayPayment(response)
            notify.success("Subscription active — thank you!")
            onSubscribed()
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Payment succeeded but confirmation failed — contact support")
          } finally {
            setBusyCycle(null)
          }
        },
        modal: { ondismiss: () => setBusyCycle(null) },
      })
      checkout.open()
    } catch (err) {
      setBusyCycle(null)
      toast.error(err instanceof Error ? err.message : "Failed to start checkout")
    }
  }

  if (!isAdministrator) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Ask your Administrator to subscribe to continue using {profile ? "your shop's" : "the"} account.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Monthly</CardTitle>
          <CardDescription>Billed every month</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-3xl font-bold">
            {formatRupees(monthly)}
            <span className="text-sm font-normal text-muted-foreground"> / month</span>
          </div>
          <Button onClick={() => handleSubscribe("monthly")} disabled={busyCycle !== null}>
            {busyCycle === "monthly" && <Loader2 className="size-4 animate-spin" />}
            Subscribe Monthly
          </Button>
        </CardContent>
      </Card>

      <Card className="border-primary">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Yearly</CardTitle>
            <Badge className="bg-primary text-primary-foreground">2 months free</Badge>
          </div>
          <CardDescription>Billed once a year</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-3xl font-bold">
            {formatRupees(yearly)}
            <span className="text-sm font-normal text-muted-foreground"> / year</span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 text-primary" /> Same as {formatRupees(monthly)}/mo for 10 months
          </p>
          <Button onClick={() => handleSubscribe("yearly")} disabled={busyCycle !== null}>
            {busyCycle === "yearly" && <Loader2 className="size-4 animate-spin" />}
            Subscribe Yearly
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
