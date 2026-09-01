import * as React from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import type { UserProfile, UserRole } from "./types"

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    displayName: string,
    role?: UserRole,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<UserProfile | null>(null)
  const [loading, setLoading] = React.useState(true)

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

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
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
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

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
    async (
      email: string,
      password: string,
      displayName: string,
      role: UserRole = "Administrator",
    ) => {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return { error: error.message }

      if (data.user) {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .insert({
            id: data.user.id,
            display_name: displayName,
            email,
            role,
          })
        if (profileError) {
          return { error: profileError.message }
        }
      }
      return { error: null }
    },
    [],
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

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
