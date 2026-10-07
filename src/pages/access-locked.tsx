import { Lock } from "lucide-react"

import { useAuth } from "@/lib/use-auth"
import { PlanPicker } from "@/components/plan-picker"

/**
 * Replaces the entire app shell (no sidebar, no nav) once an organization's
 * access level is "locked" — trial and any view-only grace period have both
 * run out. Subscribing is the only way out of this screen.
 */
export function AccessLockedScreen({ onSubscribed }: { onSubscribed: () => void }) {
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Lock className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Subscription Required</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Your trial and view-only period have ended. Subscribe to get back into your account — your data is safe and waiting.
          </p>
        </div>

        <PlanPicker onSubscribed={onSubscribed} />

        <button
          type="button"
          className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
