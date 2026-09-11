import * as React from "react"
import { supabase } from "./supabase"

/** Whether the signed-in user is a platform super admin (cross-org read access). */
export function usePlatformAdmin(): boolean {
  const [isPlatformAdmin, setIsPlatformAdmin] = React.useState(false)

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
