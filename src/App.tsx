import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider, useAuth } from "@/lib/auth"
import { RouterProvider, useRouter } from "@/lib/router"
import { AppSidebar } from "@/components/app-sidebar"
import { AuthScreen } from "@/pages/auth"
import { DashboardPage } from "@/pages/dashboard"
import { CustomersPage, CustomerDetailPage } from "@/pages/customers"
import { OrdersPage, OrderDetailPage } from "@/pages/orders"
import { NewOrderPage } from "@/pages/order-new"
import { PaymentsPage } from "@/pages/payments"
import { ProductionPage } from "@/pages/production"
import { ReportsPage } from "@/pages/reports"
import { ConfigPage } from "@/pages/config"
import { UsersPage, AuditPage } from "@/pages/admin"
import { Spinner } from "@/components/ui/spinner"

function RouteRenderer() {
  const { route } = useRouter()

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
    case "users":
      return <UsersPage />
    case "audit":
      return <AuditPage />
    default:
      return <DashboardPage />
  }
}

function AppContent() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  if (!session) {
    return <AuthScreen />
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
