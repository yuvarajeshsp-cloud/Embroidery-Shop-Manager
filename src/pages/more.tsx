import { ChevronRight, LogOut, Monitor, Moon, Sun } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { useTheme } from "@/components/theme-provider"
import { MORE_GROUPS } from "@/lib/more-nav"
import { allowedRouteNames } from "@/lib/permissions"
import { useVocabulary } from "@/lib/shop-type"
import { useRouter } from "@/lib/router"
import { useAuth } from "@/lib/use-auth"

const THEME_CYCLE = ["light", "dark", "system"] as const
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor }
const THEME_LABEL = { light: "Light", dark: "Dark", system: "System" }

const rowClass =
  "flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors active:bg-accent"

export function MorePage() {
  const { navigate } = useRouter()
  const { profile, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const allowed = allowedRouteNames(profile?.role)
  const ThemeIcon = THEME_ICON[theme]
  const vocab = useVocabulary()

  const groups = MORE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.route.name)),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-x-hidden p-4">
      <PageHeader title="More" description="Operations, admin and help" />

      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {group.label}
          </h2>
          <Card className="overflow-hidden py-0">
            <CardContent className="divide-y p-0">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <button key={item.label} type="button" className={rowClass} onClick={() => navigate(item.route)}>
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{item.route.name === "production" ? vocab.boardName : item.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">App</h2>
        <Card className="overflow-hidden py-0">
          <CardContent className="divide-y p-0">
            <button
              type="button"
              className={rowClass}
              onClick={() => setTheme(THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length])}
            >
              <ThemeIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Theme</span>
              <span className="text-xs text-muted-foreground">{THEME_LABEL[theme]}</span>
            </button>
            <button type="button" className={`${rowClass} text-destructive`} onClick={() => signOut()}>
              <LogOut className="size-4" />
              <span className="flex-1">Sign Out</span>
            </button>
          </CardContent>
        </Card>
      </section>

      <p className="pb-2 text-center text-xs text-muted-foreground">Version {__APP_VERSION__}</p>
    </div>
  )
}
