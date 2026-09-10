import * as React from "react"
import { ShieldCheck } from "lucide-react"

import { supabase } from "@/lib/supabase"
import { formatDateTime } from "@/lib/helpers"
import type { Organization } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface OrgRow extends Organization {
  memberCount: number
  customerCount: number
  orderCount: number
}

const statusColors: Record<string, string> = {
  trialing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  past_due: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
}

export function PlatformAdminPage() {
  const [rows, setRows] = React.useState<OrgRow[] | null>(null)

  React.useEffect(() => {
    loadOrgs()
  }, [])

  async function loadOrgs() {
    const { data: orgs } = await supabase.from("organizations").select("*").order("created_at", { ascending: false })
    if (!orgs) {
      setRows([])
      return
    }

    const withCounts = await Promise.all(
      orgs.map(async (org: Organization) => {
        const [{ count: memberCount }, { count: customerCount }, { count: orderCount }] = await Promise.all([
          supabase.from("user_profiles").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
          supabase.from("customers").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
          supabase.from("orders").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
        ])
        return {
          ...org,
          memberCount: memberCount || 0,
          customerCount: customerCount || 0,
          orderCount: orderCount || 0,
        }
      }),
    )
    setRows(withCounts)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader
        title="Platform Admin"
        description="Every organization on the platform — visible only to you"
      />

      <Card>
        <CardContent className="p-0">
          {rows === null ? (
            <PageLoader size="sm" />
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No organizations yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial Ends</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">
                      {org.name}
                      <div className="font-mono text-xs text-muted-foreground">{org.slug}</div>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{org.plan}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[org.subscription_status] || ""}>
                        {org.subscription_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {org.trial_ends_at ? formatDateTime(org.trial_ends_at) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{org.memberCount}</TableCell>
                    <TableCell className="text-right">{org.customerCount}</TableCell>
                    <TableCell className="text-right">{org.orderCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(org.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          This view is read-only and only ever visible to platform admins — it doesn't grant edit access to any
          organization's data, and no organization's own users can see this page or know it exists.
        </p>
      </div>
    </div>
  )
}
