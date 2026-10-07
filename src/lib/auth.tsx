import * as React from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import type { UserProfile, UserRole } from "./types"
import { clearConfigCache } from "./config"
import { claimBusinessProfile } from "./business-profile"

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "shop"
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    displayName: string,
    shopName: string,
    phone: string,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<UserProfile | null>(null)
  const [loading, setLoading] = React.useState(true)
  const lastUserId = React.useRef<string | null>(null)

  const loadProfile = React.useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      console.error("Failed to load profile:", error)
      return
    }
    setProfile(data as UserProfile | null)
  }, [])

  // Business name/logo (and config dropdown values) are cached outside React
  // for instant, flash-free loads — but that cache is keyed globally, not
  // per user. If this tab's signed-in user actually changes (sign out then
  // a different account signs in, or a stale session gets replaced), drop
  // it — otherwise whichever organization was fetched first in this tab's
  // lifetime keeps showing for every account afterward.
  const handleUserChange = React.useCallback((userId: string | null) => {
    if (userId !== lastUserId.current) {
      lastUserId.current = userId
      clearConfigCache()
      claimBusinessProfile(userId)
    }
  }, [])

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      handleUserChange(data.session?.user?.id ?? null)
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      handleUserChange(session?.user?.id ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile, handleUserChange])

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return { error: error?.message ?? null }
    },
    [],
  )

  const signUp = React.useCallback(
    async (email: string, password: string, displayName: string, shopName: string, phone: string) => {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return { error: error.message }

      if (data.user) {
        // Signing up creates a brand-new organization — this person becomes
        // its first Administrator. Joining an *existing* org only happens
        // via an invite from that org's own admin, never by picking one here.
        const baseSlug = slugify(shopName)
        let org: { id: string } | null = null
        for (let attempt = 0; attempt < 3 && !org; attempt++) {
          const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
          const { data: orgData, error: orgError } = await supabase
            .from("organizations")
            .insert({ name: shopName, slug })
            .select("id")
            .single()
          if (orgData) {
            org = orgData
          } else if (orgError?.code !== "23505") {
            return { error: orgError?.message || "Failed to create your shop" }
          }
        }
        if (!org) return { error: "Failed to create your shop — please try again" }

        const { error: profileError } = await supabase
          .from("user_profiles")
          .insert({
            id: data.user.id,
            display_name: displayName,
            email,
            phone,
            role: "Administrator" satisfies UserRole,
            organization_id: org.id,
          })
        if (profileError) {
          return { error: profileError.message }
        }

        // supabase.auth.signUp() activates the session (and this provider's
        // own auth-state listener fires) before the org/profile above ever
        // gets created — that first loadProfile() call finds nothing yet.
        // Load it again now that it actually exists.
        await loadProfile(data.user.id)
      }
      return { error: null }
    },
    [loadProfile],
  )

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const refreshProfile = React.useCallback(async () => {
    if (session?.user?.id) {
      await loadProfile(session.user.id)
    }
  }, [session?.user?.id, loadProfile])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

