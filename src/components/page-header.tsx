import * as React from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ModeToggle } from "@/components/mode-toggle"
import { useBusinessProfile } from "@/lib/business-profile"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, children, className }: PageHeaderProps) {
  const isMobile = useIsMobile()
  const { companyName, companyLogo } = useBusinessProfile()

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-nowrap items-center justify-between gap-2">
        <div className="flex min-w-0 shrink items-center gap-2">
          {!isMobile && (
            <>
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-4" />
            </>
          )}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
              {companyLogo ? (
                <img src={companyLogo} alt={companyName} className="h-full w-full object-cover" />
              ) : (
                <img src="/favicon.svg" alt={companyName} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.12em] text-muted-foreground">
                {companyName}
              </span>
              <h1 className="truncate text-xl font-bold leading-tight tracking-tight">{title}</h1>
              {description && (
                <p className="text-sm leading-tight text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          {children}
          {!isMobile && <ModeToggle />}
        </div>
      </div>
    </div>
  )
}
