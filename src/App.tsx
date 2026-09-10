import { App as CapacitorApp } from "@capacitor/app"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/lib/auth"
import { useAuth } from "@/lib/use-auth"
import { RouterProvider, useRouter, canGoBackInApp } from "@/lib/router"
import { AppSidebar } from "@/components/app-sidebar"
import { BottomNav } from "@/components/bottom-nav"
import { useIsMobile } from "@/hooks/use-mobile"
import { AuthScreen } from "@/pages/auth"
import { SetPasswordScreen } from "@/pages/set-password"
import { ProfilePage } from "@/pages/profile"
import { DashboardPage } from "@/pages/dashboard"
import { CustomersPage, CustomerDetailPage } from "@/pages/customers"
import { OrdersPage, OrderDetailPage } from "@/pages/orders"
import { NewOrderPage } from "@/pages/order-new"
import { PaymentsPage } from "@/pages/payments"
import { ProductionPage } from "@/pages/production"
import { ReportsPage } from "@/pages/reports"
import { ConfigPage } from "@/pages/config"
import { WhatsAppPage } from "@/pages/whatsapp"
import { UsersPage, AuditPage } from "@/pages/admin"
import { AppLoader } from "@/components/app-loader"
import { useBusinessProfile } from "@/lib/business-profile"
import { setFavicon } from "@/lib/favicon"
import { canAccessRoute } from "@/lib/permissions"
import * as React from "react"

function AccessDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h2 className="text-lg font-semibold">Access Denied</h2>
      <p className="text-sm text-muted-foreground">Your role doesn't have permission to view this page.</p>
    </div>
  )
}

function RouteRenderer() {
  const { route } = useRouter()
  const { profile } = useAuth()

  if (!canAccessRoute(profile?.role, route.name)) {
    return <AccessDenied />
  }

  switch (route.name) {
    case "dashboard":
      return <DashboardPage />
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
    default:
      return <DashboardPage />
  }
}

function AppContent() {
  const { session, loading } = useAuth()
  const isMobile = useIsMobile()
  const businessProfile = useBusinessProfile()
  const [pendingAuthType, setPendingAuthType] = React.useState<string | null>(
    () => sessionStorage.getItem("pendingAuthType"),
  )

  React.useEffect(() => {
    setFavicon(session ? businessProfile.companyLogo : null)
  }, [session, businessProfile.companyLogo])

  React.useEffect(() => {
    document.title = businessProfile.companyName
  }, [businessProfile.companyName])

  if (loading) {
    return <AppLoader />
  }

  if (session && pendingAuthType) {
    return <SetPasswordScreen onDone={() => setPendingAuthType(null)} />
  }

  if (!session) {
    return <AuthScreen />
  }

  if (isMobile) {
    return (
      <div className="flex min-h-svh flex-col pt-[env(safe-area-inset-top)]">
        <div className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <RouteRenderer />
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <RouteRenderer />
      </SidebarInset>
    </SidebarProvider>
  )
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
