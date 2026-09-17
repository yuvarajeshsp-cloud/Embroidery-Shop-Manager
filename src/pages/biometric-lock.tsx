import * as React from "react"
import { Loader2, Fingerprint } from "lucide-react"

import { useAuth } from "@/lib/use-auth"
import { authenticateWithBiometry } from "@/lib/biometric-unlock"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export function BiometricLockScreen({ label, onUnlocked }: { label: string; onUnlocked: () => void }) {
  const { signOut } = useAuth()
  const [verifying, setVerifying] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const attemptedOnMount = React.useRef(false)

  const attempt = React.useCallback(async () => {
    setVerifying(true)
    setError(null)
    const ok = await authenticateWithBiometry(`Unlock with ${label}`)
    setVerifying(false)
    if (ok) {
      onUnlocked()
    } else {
      setError("Verification failed or cancelled")
    }
  }, [label, onUnlocked])

  React.useEffect(() => {
    if (attemptedOnMount.current) return
    attemptedOnMount.current = true
    void attempt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="size-5" /> App Locked
            </CardTitle>
            <CardDescription>Use {label} to continue</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={attempt} disabled={verifying}>
              {verifying && <Loader2 className="size-4 animate-spin" />}
              Unlock with {label}
            </Button>
            <button
              type="button"
              className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => void signOut()}
            >
              Sign out instead
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
