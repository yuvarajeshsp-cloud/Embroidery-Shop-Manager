import { PageHeader } from "@/components/page-header"
import { PrinterCard } from "@/components/printer-card"
import { PrinterLayoutCard } from "@/components/printer-layout-card"

export function PrinterPage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Printer" description="Thermal receipt printer and receipt layout" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <PrinterCard />
        <PrinterLayoutCard />
      </div>
    </div>
  )
}
