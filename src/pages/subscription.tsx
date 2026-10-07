import { Crown } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PlanPicker } from "@/components/plan-picker"
import { formatDateTime } from "@/lib/helpers"
import { useAuth } from "@/lib/use-auth"
import { useOrganizationAccess } from "@/lib/subscription"

const statusLabel: Record<string, string> = {
  trialing: "Free Trial",
  active: "Active",
  past_due: "Payment Failed",
  canceled: "Canceled",
  expired: "Expired",
  comped: "Complimentary",
}

const statusColors: Record<string, string> = {
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  past_due: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  canceled: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  comped: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
}

export function SubscriptionPage() {
  const { profile } = useAuth()
  const { accessLevel, organization, loading, refresh } = useOrganizationAccess(profile?.organization_id ?? null)

  if (!profile || loading) {
    return <PageLoader />
  }

  const renewsAt = organization?.subscription_status === "active" ? organization.subscription_current_period_end : null
  const trialEndsAt = organization?.subscription_status === "trialing" ? organization.trial_ends_at : null

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Subscription" description="Manage your plan and billing" />

      {organization && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="size-4" /> Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusColors[organization.subscription_status] || ""}>
                {statusLabel[organization.subscription_status] || organization.subscription_status}
              </Badge>
              {organization.subscription_status !== "trialing" && (
                <span className="text-sm capitalize text-muted-foreground">{organization.plan} plan</span>
              )}
            </div>
            {trialEndsAt && (
              <p className="text-sm text-muted-foreground">Trial ends {formatDateTime(trialEndsAt)}</p>
            )}
            {renewsAt && (
              <p className="text-sm text-muted-foreground">Renews {formatDateTime(renewsAt)}</p>
            )}
            {accessLevel === "view_only" && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                You can view existing records, but subscribing is required to create or edit anything.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <PlanPicker onSubscribed={refresh} />
    </div>
  )
}
