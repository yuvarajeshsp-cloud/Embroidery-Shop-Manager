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

export interface OrgOption {
  id: string
  name: string
}

/**
 * For a platform admin only: every organization, as both a lookup map (for
 * rendering an "Organization" column) and an options list (for a filter
 * dropdown). Empty for anyone else — regular users only ever see their own
 * org's rows anyway, so there's nothing meaningful to look up or filter.
 */
export function useOrganizationDirectory(): { orgs: OrgOption[]; orgMap: Map<string, string> } {
  const isPlatformAdmin = usePlatformAdmin()
  const [orgs, setOrgs] = React.useState<OrgOption[]>([])

  React.useEffect(() => {
    if (!isPlatformAdmin) {
      setOrgs([])
      return
    }
    let mounted = true
    supabase
      .from("organizations")
      .select("id,name")
      .order("name")
      .then(({ data }) => {
        if (mounted) setOrgs(data || [])
      })
    return () => {
      mounted = false
    }
  }, [isPlatformAdmin])

  const orgMap = React.useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs])
  return { orgs, orgMap }
}
