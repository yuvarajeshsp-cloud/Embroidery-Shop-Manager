const DEFAULT_HREF = "/favicon.png"
const ICON_SIZE = 64

let lastSourceHref: string | null | undefined
let resizeToken = 0

function getLink(): HTMLLinkElement {
  let link = document.getElementById("app-favicon") as HTMLLinkElement | null
  if (!link) {
    link = document.createElement("link")
    link.id = "app-favicon"
    link.rel = "icon"
    document.head.appendChild(link)
  }
  return link
}

function applyHref(href: string, isDefault: boolean) {
  const link = getLink()
  if (isDefault) {
    link.type = "image/png"
  } else {
    link.removeAttribute("type")
  }
  link.href = href
  // Some browsers (notably Chrome) don't repaint the tab icon on a plain
  // href mutation — re-triggering `rel` forces it to re-evaluate the link.
  link.rel = ""
  link.rel = "icon"
}

/**
 * The uploaded business logo can be a large photo (tens of KB as a base64
 * data: URL); some browsers silently refuse to render an oversized data URI
 * as a favicon. Downscale it to a small square first so it's both safely
 * within size limits and crisp at tab-icon scale.
 */
function resizeToIcon(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = ICON_SIZE
        canvas.height = ICON_SIZE
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve(null)
        const scale = Math.max(ICON_SIZE / img.width, ICON_SIZE / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h)
        resolve(canvas.toDataURL("image/png"))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Swaps the browser tab icon to the given logo (a URL or data: URL); pass null to restore the app's own icon. */
export function setFavicon(logoUrl: string | null) {
  if (lastSourceHref === logoUrl) return
  lastSourceHref = logoUrl
  const token = ++resizeToken

  if (!logoUrl) {
    applyHref(DEFAULT_HREF, true)
    return
  }

  void resizeToIcon(logoUrl).then((resized) => {
    if (token !== resizeToken) return
    applyHref(resized || logoUrl, false)
  })
}
