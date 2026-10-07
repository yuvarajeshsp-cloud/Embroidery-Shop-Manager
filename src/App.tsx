import { App as CapacitorApp } from "@capacitor/app"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/lib/auth"
import { useAuth } from "@/lib/use-auth"
import { RouterProvider, useRouter, canGoBackInApp, type Route } from "@/lib/router"
import { AppSidebar } from "@/components/app-sidebar"
import { BottomNav } from "@/components/bottom-nav"
import { PageStack } from "@/components/page-stack"
import { useIsMobile } from "@/hooks/use-mobile"
import { AuthScreen } from "@/pages/auth"
import { SetPasswordScreen } from "@/pages/set-password"
import { VerifyPhoneScreen } from "@/pages/verify-phone"
import { AccountDeactivatedScreen } from "@/pages/account-deactivated"
import { BiometricLockScreen } from "@/pages/biometric-lock"
import {
  isBiometricUnlockEnabled,
  getBiometryAvailability,
  isBiometricAuthInFlight,
  consumeBiometricResumeSuppression,
  clearStaleBiometricResumeSuppression,
  isBiometricResumeSuppressionPending,
} from "@/lib/biometric-unlock"
import { ProfilePage } from "@/pages/profile"
import { DashboardPage } from "@/pages/dashboard"
import { CustomersPage, CustomerDetailPage } from "@/pages/customers"
import { OrdersPage, OrderDetailPage } from "@/pages/orders"
import { NewOrderPage } from "@/pages/order-new"
import { PaymentsPage } from "@/pages/payments"
import { ExpensesPage } from "@/pages/expenses"
import { ProductionPage } from "@/pages/production"
import { ReportsPage } from "@/pages/reports"
import { ConfigPage } from "@/pages/config"
import { WhatsAppPage } from "@/pages/whatsapp"
import { UsersPage, AuditPage } from "@/pages/admin"
import { PlatformAdminPage, PlatformAdminOrgPage } from "@/pages/platform-admin"
import { SubscriptionPage } from "@/pages/subscription"
import { MorePage } from "@/pages/more"
import { HelpPage, FaqPage, PrivacyPage } from "@/pages/help"
import { AccessLockedScreen } from "@/pages/access-locked"
import { AppLoader } from "@/components/app-loader"
import { useBusinessProfile } from "@/lib/business-profile"
import { usePlatformAdmin } from "@/lib/platform-admin"
import { useOrganizationAccess } from "@/lib/subscription"
import { setFavicon } from "@/lib/favicon"
import { canAccessRoute } from "@/lib/permissions"
import { FEATURES } from "@/lib/features"
import { Button } from "@/components/ui/button"
import * as React from "react"

// The router remembers the last-visited page across sessions (browser
// history), so a different, more limited role signing into the same
// browser/tab can land directly on a page their role no longer permits —
// e.g. a shared shop device where an Administrator was last on Users &
// Roles and an Operator signs in next, or a brand-new sign-up inheriting
// the previous session's Platform Admin page. Bounce to Dashboard instead
// of stranding them on a dead-end "Access Denied" screen. The More list only
// exists on mobile, so it bounces too when there is no bottom nav.
function useRouteGuard(isMobile: boolean) {
  const { route, navigate } = useRouter()
  const { profile } = useAuth()
  const isPlatformAdmin = usePlatformAdmin()
  const isPlatformAdminRoute = route.name === "platform-admin" || route.name === "platform-admin-org"
  const hasAccess = canAccessRoute(profile?.role, route.name)

  React.useEffect(() => {
    if (isPlatformAdminRoute) {
      if (isPlatformAdmin === false) navigate({ name: "dashboard" })
      return
    }
    if (route.name === "more" && !isMobile) {
      navigate({ name: "dashboard" })
      return
    }
    if (!hasAccess && route.name !== "dashboard") {
      navigate({ name: "dashboard" })
    }
  }, [hasAccess, route.name, navigate, isPlatformAdminRoute, isPlatformAdmin, isMobile])
}

function RouteView({ route }: { route: Route }) {
  const { profile } = useAuth()
  const isPlatformAdmin = usePlatformAdmin()

  if (route.name === "platform-admin") {
    return isPlatformAdmin ? <PlatformAdminPage /> : <AppLoader />
  }
  if (route.name === "platform-admin-org") {
    return isPlatformAdmin ? <PlatformAdminOrgPage id={route.id} /> : <AppLoader />
  }

  if (!canAccessRoute(profile?.role, route.name)) {
    return <AppLoader />
  }

  switch (route.name) {
    case "dashboard":
      return <DashboardPage />
    case "more":
      return <MorePage />
    case "customers":
      return <CustomersPage />
    case "customer-detail":
      return <CustomerDetailPage id={route.id} />
    case "orders":
      return <OrdersPage />
    case "order-detail":
      return <OrderDetailPage id={route.id} />
    case "order-new":
      return <NewOrderPage />
    case "payments":
      return <PaymentsPage />
    case "expenses":
      return <ExpensesPage />
    case "production":
      return <ProductionPage />
    case "reports":
      return <ReportsPage />
    case "config":
      return <ConfigPage />
    case "whatsapp":
      return <WhatsAppPage />
    case "users":
      return <UsersPage />
    case "audit":
      return <AuditPage />
    case "profile":
      return <ProfilePage />
    case "subscription":
      return <SubscriptionPage />
    case "help":
      return <HelpPage />
    case "faq":
      return <FaqPage />
    case "privacy":
      return <PrivacyPage />
    default:
      return <DashboardPage />
  }
}

function AppContent() {
  const { session, profile, loading } = useAuth()
  const businessProfile = useBusinessProfile()
  const [pendingAuthType, setPendingAuthType] = React.useState<string | null>(
    () => sessionStorage.getItem("pendingAuthType"),
  )
  const [biometricLock, setBiometricLock] = React.useState<{ locked: boolean; label: string } | null>(null)

  React.useEffect(() => {
    setFavicon(session ? businessProfile.companyLogo : null)
  }, [session, businessProfile.companyLogo])

  React.useEffect(() => {
    document.title = businessProfile.companyName
  }, [businessProfile.companyName])

  // Biometric unlock is a per-device lock screen in front of the already-
  // persisted Supabase session, not a separate credential — it only ever
  // runs once a real session exists. Re-armed whenever the app returns to
  // the foreground, so backgrounding the app re-locks it.
  //
  // Keyed on the user id, NOT the session object itself: autoRefreshToken
  // silently swaps in a new session object (new access token) on every
  // background refresh while the user stays signed in, and that object is
  // a new reference each time. Depending on `session` directly re-ran this
  // effect on every refresh and re-prompted Face ID even though nothing
  // about the sign-in actually changed — that was the "keeps asking for
  // Face ID" bug. The user id is stable across refreshes.
  const userId = session?.user?.id ?? null
  React.useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function checkLock() {
      const [enabled, availability] = await Promise.all([isBiometricUnlockEnabled(), getBiometryAvailability()])
      if (cancelled || !enabled || !availability?.isAvailable) return
      const label = availability.biometryTypes.includes(2) ? "Face ID" : availability.biometryTypes.includes(1) ? "Touch ID" : "Fingerprint"
      setBiometricLock({ locked: true, label })
    }
    // Signing in with the "Sign in with Face ID" button on the auth screen
    // (see auth.tsx) runs its own authenticateWithBiometry() call *before*
    // this effect ever mounts — session goes from null to set only once
    // that sign-in succeeds, which is what makes userId truthy here for the
    // first time. Immediately re-locking and asking for Face ID a second
    // time would be redundant, so skip this one check when that prompt's
    // suppression is still pending. This only *peeks* — it must not consume
    // the flag, since the prompt's real trailing isActive:true event hasn't
    // been delivered yet (it's delayed by the OS's dismiss animation) and
    // still needs the flag to be there when the listener below receives it;
    // consuming it here instead just moves the redundant re-lock a moment
    // later rather than removing it.
    if (!isBiometricResumeSuppressionPending()) {
      checkLock()
    }

    const sub = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        // A real backgrounding (not one caused by our own prompt) clears any
        // stale resume suppression so it can't swallow a later, real lock
        // check — see clearStaleBiometricResumeSuppression's doc comment.
        if (!isBiometricAuthInFlight()) clearStaleBiometricResumeSuppression()
        return
      }
      // Skip transitions caused by our own Face ID/Touch ID sheet opening
      // and closing — see isBiometricAuthInFlight's doc comment.
      if (isBiometricAuthInFlight()) return
      if (consumeBiometricResumeSuppression()) return
      checkLock()
    })
    return () => {
      cancelled = true
      void sub.then((s) => s.remove())
    }
  }, [userId])

  if (loading) {
    return <AppLoader />
  }

  if (session && pendingAuthType) {
    return <SetPasswordScreen onDone={() => setPendingAuthType(null)} />
  }

  if (!session) {
    return <AuthScreen />
  }

  if (biometricLock?.locked) {
    return <BiometricLockScreen label={biometricLock.label} onUnlocked={() => setBiometricLock(null)} />
  }

  if (profile && !profile.is_active) {
    return <AccountDeactivatedScreen />
  }

  if (profile && !profile.phone_verified) {
    return <VerifyPhoneScreen />
  }

  return FEATURES.subscription ? <SubscriptionGate profile={profile} /> : <AppShell />
}

function AppShell({ banner }: { banner?: React.ReactNode }) {
  const isMobile = useIsMobile()
  const { route } = useRouter()
  useRouteGuard(isMobile)

  if (isMobile) {
    return (
      <div className="flex min-h-svh flex-col pt-[env(safe-area-inset-top)]">
        {banner}
        <div className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <PageStack renderRoute={(r) => <RouteView route={r} />} />
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {banner}
        <RouteView route={route} />
      </SidebarInset>
    </SidebarProvider>
  )
}

// Held back from the current release — see FEATURES in lib/features.ts.
// With the flag off the app never looks at the subscription at all (the
// database side is switched off separately via
// platform_settings.subscription_enforced).
function SubscriptionGate({ profile }: { profile: ReturnType<typeof useAuth>["profile"] }) {
  const { navigate } = useRouter()
  const { accessLevel, loading, refresh } = useOrganizationAccess(profile?.organization_id ?? null)

  if (loading) {
    return <AppLoader />
  }

  if (accessLevel === "locked") {
    return <AccessLockedScreen onSubscribed={refresh} />
  }

  const viewOnlyBanner = accessLevel === "view_only" && (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <span>Your subscription has ended — you can view existing data, but creating or editing needs an active plan.</span>
      <Button size="sm" variant="outline" onClick={() => navigate({ name: "subscription" })}>
        Subscribe
      </Button>
    </div>
  )

  return <AppShell banner={viewOnlyBanner} />
}

export function App() {
  React.useEffect(() => {
    const sub = CapacitorApp.addListener("backButton", () => {
      if (canGoBackInApp()) {
        window.history.back()
      } else {
        void CapacitorApp.exitApp()
      }
    })
    return () => {
      void sub.then((s) => s.remove())
    }
  }, [])

  return (
    <AuthProvider>
      <RouterProvider>
        <AppContent />
        <Toaster richColors position="top-right" />
      </RouterProvider>
    </AuthProvider>
  )
}

export default App
