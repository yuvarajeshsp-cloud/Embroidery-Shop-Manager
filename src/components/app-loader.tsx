import { useBusinessProfile } from "@/lib/business-profile"
import { cn } from "@/lib/utils"

const SIZE_CLASSES = {
  sm: "size-9",
  md: "size-14",
  lg: "size-20",
} as const

function LogoSpinner({ size = "md" }: { size?: keyof typeof SIZE_CLASSES }) {
  const { companyLogo: logo } = useBusinessProfile()
  return (
    <div className={cn("relative shrink-0", SIZE_CLASSES[size])}>
      <div className="absolute inset-0 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <div className="absolute inset-[3px] flex items-center justify-center overflow-hidden rounded-full bg-background">
        {/* The shop's own logo when it has one, otherwise the app's logo. */}
        <img src={logo || "/app-icon.png"} alt="" className="size-full object-cover" />
      </div>
    </div>
  )
}

/** Full-viewport loader — app boot, auth resolving. */
export function AppLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-svh items-center justify-center", className)}>
      <LogoSpinner size="lg" />
    </div>
  )
}

/**
 * In-page loader for a section that's fetching data (a page body, a card's
 * content, a dialog). Fills the available space it's placed in.
 */
export function PageLoader({
  className,
  size = "md",
  label,
}: {
  className?: string
  size?: keyof typeof SIZE_CLASSES
  label?: string
}) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-3 p-8", className)}>
      <LogoSpinner size={size} />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  )
}
