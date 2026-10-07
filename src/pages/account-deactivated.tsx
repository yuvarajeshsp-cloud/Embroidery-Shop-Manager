import { UserX } from "lucide-react"

import { useAuth } from "@/lib/use-auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

/**
 * Shown to someone an Administrator has switched to Inactive. The database
 * already refuses them every shop record (see
 * 20261008020000_enforce_inactive_users.sql) — this just explains why instead
 * of leaving them on a blank screen.
 */
export function AccountDeactivatedScreen() {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="size-5" /> Account deactivated
            </CardTitle>
            <CardDescription>
              Your access to this shop has been switched off by an Administrator. If you think this is a mistake, please ask your shop's Administrator to set you back to Active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
