import * as React from "react"
import { supabase } from "./supabase"

/**
 * Whether the signed-in user is a platform super admin (cross-org read
 * access). Returns `null` until the check comes back from the server —
 * callers that gate a redirect on this being `false` must wait out the
 * `null` state first, or they'll bounce a real platform admin away before
 * their status has even been confirmed.
 */
export function usePlatformAdmin(): boolean | null {
  const [isPlatformAdmin, setIsPlatformAdmin] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let mounted = true
    supabase.rpc("is_platform_admin").then(({ data }) => {
      if (mounted) setIsPlatformAdmin(!!data)
    })
    return () => {
      mounted = false
    }
  }, [])

  return isPlatformAdmin
}
