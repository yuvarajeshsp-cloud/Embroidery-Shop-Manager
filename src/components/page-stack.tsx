import * as React from "react"

import { isMoreChild, isMoreStackRoute, routeKey } from "@/lib/more-nav"
import { useRouter, type NavDirection, type Route } from "@/lib/router"
import { cn } from "@/lib/utils"

// Mobile page host. Pages in the More section (the More list and everything
// opened from it) behave like a native navigation stack: opening one pushes it
// in from the right, going back slides it out to the right, and a swipe from
// the left edge drags it away with the page beneath following along. Every
// other route (the main tabs, order details) simply swaps in place.

const DURATION_MS = 300
const SNAP_MS = 220
const EDGE_PX = 28
const UNDER_SHIFT = 28 // % the page beneath sits left of its resting place

type Role = "shown" | "in" | "under" | "out" | "under-in" | "peek"

interface Layer {
  route: Route
  role: Role
}

const level = (route: Route) => (route.name === "more" ? 0 : 1)

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

const ROLE_CLASS: Record<Role, string> = {
  shown: "",
  in: "stack-layer-min stack-layer-shadow stack-in-forward relative z-20 bg-background",
  under: "stack-layer-fixed stack-under-forward z-10 bg-background",
  out: "stack-layer-fixed stack-layer-shadow stack-out-back z-20 bg-background",
  "under-in": "stack-layer-min stack-in-back relative z-10 bg-background",
  peek: "stack-layer-fixed z-10 bg-background",
}

export function PageStack({ renderRoute }: { renderRoute: (route: Route) => React.ReactNode }) {
  const { route, direction, previousRoute, goBack } = useRouter()
  const [shown, setShown] = React.useState(route)
  const [leaving, setLeaving] = React.useState<{ route: Route; dir: NavDirection } | null>(null)
  const [peek, setPeek] = React.useState<Route | null>(null)
  // Set once a swipe has already slid the page away, so the route change that
  // follows doesn't animate a second time.
  const skipRef = React.useRef(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  if (routeKey(shown) !== routeKey(route)) {
    let dir: NavDirection | null = null
    if (!skipRef.current && !reducedMotion() && isMoreStackRoute(shown.name) && isMoreStackRoute(route.name)) {
      dir = level(route) < level(shown) ? "back" : level(route) > level(shown) ? "forward" : direction
    }
    setShown(route)
    setLeaving(dir ? { route: shown, dir } : null)
    setPeek(null)
  }

  React.useEffect(() => {
    skipRef.current = false
  }, [route])

  React.useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setLeaving(null), DURATION_MS + 60)
    return () => window.clearTimeout(timer)
  }, [leaving])

  // Edge-swipe back, only on pages opened from More.
  const swipeRef = React.useRef({ canSwipe: false, previousRoute, goBack })
  swipeRef.current = { canSwipe: isMoreChild(shown.name) && !leaving, previousRoute, goBack }

  React.useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null
    let active = false
    let lastX = 0

    const el = (role: Role) => containerRef.current?.querySelector<HTMLElement>(`[data-role="${role}"]`) ?? null

    function apply(x: number) {
      const p = Math.min(1, x / window.innerWidth)
      const top = el("shown")
      const under = el("peek")
      if (top) top.style.transform = `translateX(${x}px)`
      if (under) {
        under.style.transform = `translateX(${-UNDER_SHIFT * (1 - p)}%)`
        under.style.filter = `brightness(${0.9 + 0.1 * p})`
      }
    }

    function onStart(e: TouchEvent) {
      start = null
      active = false
      if (!swipeRef.current.canSwipe || e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX > EDGE_PX) return
      start = { x: t.clientX, y: t.clientY, t: Date.now() }
      lastX = 0
    }

    function onMove(e: TouchEvent) {
      if (!start) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (!active) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          start = null
          return
        }
        if (dx <= 10) return
        active = true
        setPeek(swipeRef.current.previousRoute() ?? { name: "more" })
      }
      e.preventDefault()
      lastX = Math.max(0, dx)
      apply(lastX)
    }

    function onEnd() {
      if (!start || !active) {
        start = null
        return
      }
      const elapsed = Math.max(1, Date.now() - start.t)
      const commit = lastX > window.innerWidth * 0.35 || (lastX / elapsed > 0.5 && lastX > 40)
      start = null
      active = false

      const top = el("shown")
      const under = el("peek")
      const transition = `transform ${SNAP_MS}ms ease-out, filter ${SNAP_MS}ms ease-out`
      if (top) {
        top.style.transition = transition
        top.style.transform = commit ? "translateX(100%)" : "translateX(0)"
      }
      if (under) {
        under.style.transition = transition
        under.style.transform = commit ? "translateX(0)" : `translateX(-${UNDER_SHIFT}%)`
        under.style.filter = commit ? "brightness(1)" : "brightness(0.9)"
      }
      window.setTimeout(() => {
        if (commit) {
          skipRef.current = true
          if (under) {
            under.style.transition = ""
            under.style.transform = ""
            under.style.filter = ""
          }
          swipeRef.current.goBack({ name: "more" })
        } else {
          if (top) {
            top.style.transition = ""
            top.style.transform = ""
          }
          setPeek(null)
        }
      }, SNAP_MS)
    }

    // The (non-passive) move listener is only attached for the length of a
    // swipe that begins at the left edge. Leaving a permanent non-passive
    // touchmove listener on the document left patches of the Android WebView
    // unpainted after page changes.
    function onStartEdge(e: TouchEvent) {
      onStart(e)
      if (start) {
        document.addEventListener("touchmove", onMove, { passive: false })
        document.addEventListener("touchend", finish)
        document.addEventListener("touchcancel", finish)
      }
    }
    function finish() {
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", finish)
      document.removeEventListener("touchcancel", finish)
      onEnd()
    }
    document.addEventListener("touchstart", onStartEdge, { passive: true })
    return () => {
      document.removeEventListener("touchstart", onStartEdge)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", finish)
      document.removeEventListener("touchcancel", finish)
    }
  }, [])

  const dragging = !!peek && !leaving
  const layers: Layer[] = []
  if (leaving) {
    layers.push({ route: leaving.route, role: leaving.dir === "forward" ? "under" : "out" })
  } else if (peek && routeKey(peek) !== routeKey(shown)) {
    layers.push({ route: peek, role: "peek" })
  }
  layers.push({ route: shown, role: leaving ? (leaving.dir === "forward" ? "in" : "under-in") : "shown" })

  return (
    <div
      ref={containerRef}
      // Clipping and positioning only while pages are actually moving; a
      // permanent clip on the page host left patches of the Android WebView
      // unpainted (blank headers).
      className={cn((leaving || dragging) && "relative overflow-x-clip")}
    >
      {layers.map((layer) => (
        <div
          key={routeKey(layer.route)}
          data-role={layer.role}
          className={cn(
            ROLE_CLASS[layer.role],
            layer.role === "shown" && dragging && "stack-layer-min stack-layer-shadow relative z-20 bg-background",
          )}
          style={layer.role === "peek" ? { transform: `translateX(-${UNDER_SHIFT}%)`, filter: "brightness(0.9)" } : undefined}
        >
          {renderRoute(layer.route)}
        </div>
      ))}
    </div>
  )
}
