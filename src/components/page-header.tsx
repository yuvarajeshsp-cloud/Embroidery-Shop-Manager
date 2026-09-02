import * as React from "react"
import { Scissors } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ModeToggle } from "@/components/mode-toggle"
import { fetchBusinessSettings } from "@/lib/config"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  const [companyName, setCompanyName] = React.useState("Embroidery Shop Manager")
  const [companyLogo, setCompanyLogo] = React.useState<string | null>(null)

  React.useEffect(() => {
    let mounted = true

    void fetchBusinessSettings().then((settings) => {
      if (!mounted) return
      const nextName = (settings.company_name || "Embroidery Shop Manager").trim() || "Embroidery Shop Manager"
      setCompanyName(nextName)
      setCompanyLogo(settings.company_logo_data_url || null)
    })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center overflow-hidden rounded-md border bg-background">
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className="h-full w-full object-cover" />
              ) : (
                <Scissors className="size-4" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {companyName}
              </span>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {children}
          <ModeToggle />
        </div>
      </div>
    </div>
  )
}
