import * as React from "react"
import { Search } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { PageLoader } from "@/components/app-loader"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useRouter } from "@/lib/router"
import { FAQ_GROUPS, HELP_SECTIONS } from "@/lib/help-content"

export function HelpPage() {
  const { navigate } = useRouter()

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Help" description="How to get things done in the app">
        <Button variant="outline" size="sm" onClick={() => navigate({ name: "faq" })}>
          FAQ
        </Button>
      </PageHeader>

      <nav aria-label="Help topics" className="flex flex-wrap gap-2">
        {HELP_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
            className="rounded-full border bg-background px-3 py-1 text-sm hover:bg-accent"
          >
            {section.title}
          </a>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        {HELP_SECTIONS.map((section) => (
          <Card key={section.id} id={section.id} className="scroll-mt-4">
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              {section.intro && <CardDescription>{section.intro}</CardDescription>}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {section.steps && (
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
              {section.tips && (
                <ul className="flex list-disc flex-col gap-1.5 rounded-md bg-muted/50 p-3 pl-7 text-sm leading-relaxed text-muted-foreground">
                  {section.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Still stuck? Check the{" "}
        <button type="button" className="underline underline-offset-2" onClick={() => navigate({ name: "faq" })}>
          FAQ
        </button>
        , or ask your shop's Administrator.
      </p>
    </div>
  )
}

export function FaqPage() {
  const { navigate } = useRouter()
  const [query, setQuery] = React.useState("")

  const needle = query.trim().toLowerCase()
  const groups = FAQ_GROUPS.map((group) => ({
    ...group,
    items: needle
      ? group.items.filter((item) => `${item.q} ${item.a}`.toLowerCase().includes(needle))
      : group.items,
  })).filter((group) => group.items.length > 0)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="FAQ" description="Quick answers to common questions">
        <Button variant="outline" size="sm" onClick={() => navigate({ name: "help" })}>
          Help guides
        </Button>
      </PageHeader>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions…"
          className="pl-9"
          aria-label="Search questions"
        />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No questions match “{query}”. Try a different word, or browse the Help guides.
          </CardContent>
        </Card>
      ) : (
        <div className="flex max-w-3xl flex-col gap-4">
          {groups.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle className="text-base">{group.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible>
                  {group.items.map((item) => (
                    <AccordionItem key={item.q} value={item.q}>
                      <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                      <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// The policy lives in one place — /privacy.html, the same file Google Play
// and the App Store link to — and is read from there at runtime, so the
// in-app page can never drift out of step with the published one. That file
// is also bundled into the Android/iOS apps, so this works offline there.
export function PrivacyPage() {
  const [html, setHtml] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetch("/privacy.html")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.text()
      })
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, "text/html")
        const main = doc.querySelector("main")
        if (!main) throw new Error("no content")
        // The page header already shows the title.
        main.querySelector("h1")?.remove()
        main.querySelector("p.muted")?.classList.add("text-muted-foreground")
        // Never navigate the app's own window away from the app.
        main.querySelectorAll("a").forEach((a) => {
          a.setAttribute("target", "_blank")
          a.setAttribute("rel", "noreferrer")
        })
        if (!cancelled) setHtml(main.innerHTML)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden p-4 md:p-6">
      <PageHeader title="Privacy Policy" description="How your information is handled" />

      {failed ? (
        <Card>
          <CardContent className="p-6 text-sm">
            The policy couldn't be loaded right now. You can read it online at{" "}
            <a href="https://paavaifashions.com/privacy.html" target="_blank" rel="noreferrer" className="underline">
              paavaifashions.com/privacy.html
            </a>
            .
          </CardContent>
        </Card>
      ) : html === null ? (
        <PageLoader size="sm" />
      ) : (
        <Card className="max-w-3xl">
          <CardContent
            className="text-sm leading-relaxed [&_a]:underline [&_h2]:mb-1 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-1 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Card>
      )}
    </div>
  )
}
