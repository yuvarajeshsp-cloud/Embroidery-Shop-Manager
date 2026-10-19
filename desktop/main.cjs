const { app, BrowserWindow, dialog, Menu, ipcMain, net, protocol, session, shell } = require("electron")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

// The built web app is served from a private app:// address, so it behaves like
// a normal secure website (service storage, IndexedDB, fetch) without a server.
const SCHEME = "app"
const HOST = "shop"
const BUNDLED = path.join(__dirname, "app")

// ---- which web build to run ---------------------------------------------------
// The installer carries one build of the web app. Newer builds are fetched from
// the website in the background (see checkForUpdate), checked against a
// signature, kept in the user's data folder and used from the next launch. If a
// downloaded build ever fails to load, the bundled one is used again.

const UPDATE_BASE = process.env.SHOP_UPDATE_URL || "https://app.paavaifashions.com"
const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAuundgemaa+Dd7W8q35qO+cJ4cMySqGSTDfpYWLA9QEg=
-----END PUBLIC KEY-----
`
const webDir = () => path.join(app.getPath("userData"), "web")
const BUILD_ID = /^[a-f0-9]{16,64}$/

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}

/** The folder the app is served from: the newest downloaded build, else the bundled one. */
function chooseRoot() {
  const current = readJson(path.join(webDir(), "current.json"))
  if (current && typeof current.buildId === "string" && BUILD_ID.test(current.buildId)) {
    const dir = path.join(webDir(), current.buildId)
    if (fs.existsSync(path.join(dir, "index.html"))) return { dir, buildId: current.buildId }
  }
  return { dir: BUNDLED, buildId: readJson(path.join(BUNDLED, "update-manifest.json"))?.buildId ?? null, bundled: true }
}
let root = null

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

app.setName("Shop Manager")

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow = null

function serveApp() {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    const wanted = path.normalize(decodeURIComponent(url.pathname))
    const file = path.join(root.dir, wanted)
    // Must stay inside the folder (the separator stops a sibling like "app-old" matching).
    if (file !== root.dir && !file.startsWith(root.dir + path.sep)) return new Response("Forbidden", { status: 403 })
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return net.fetch(pathToFileURL(file).href)
    // A missing file with an extension is a real 404; anything else is a page inside the app.
    if (path.extname(wanted)) return new Response("Not found", { status: 404 })
    return net.fetch(pathToFileURL(path.join(root.dir, "index.html")).href)
  })
}

// ---- keeping the web build up to date -------------------------------------------

function versionAtLeast(have, need) {
  const a = String(have).split(".").map(Number)
  const b = String(need).split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return true
}

const SAFE_PATH = /^[A-Za-z0-9_@.\-][A-Za-z0-9_@./\-]*$/
const safeRelPath = (p) => typeof p === "string" && SAFE_PATH.test(p) && !p.split("/").some((seg) => seg === ".." || seg === "." || seg === "")

let checking = false

/** Fetches the newest signed web build, if there is one, and stages it for the next launch. */
async function checkForUpdate() {
  if (checking) return
  checking = true
  try {
    const get = (name) => net.fetch(`${UPDATE_BASE}/${name}`, { cache: "no-store" })
    const [mRes, sRes] = await Promise.all([get("update-manifest.json"), get("update-manifest.sig")])
    if (!mRes.ok || !sRes.ok) return
    const text = await mRes.text()
    const signature = Buffer.from((await sRes.text()).trim(), "base64")
    // Nothing is trusted until the signature over the whole file list checks out.
    if (!crypto.verify(null, Buffer.from(text), UPDATE_PUBLIC_KEY, signature)) return
    const manifest = JSON.parse(text)
    if (typeof manifest.buildId !== "string" || !BUILD_ID.test(manifest.buildId) || !Array.isArray(manifest.files)) return
    if (!versionAtLeast(app.getVersion(), manifest.minShell || "0.0.0")) return // needs a newer installer
    if (manifest.buildId === root.buildId) return
    const target = path.join(webDir(), manifest.buildId)
    if (fs.existsSync(path.join(target, "index.html"))) return // already downloaded, waiting for a restart

    const active = readJson(path.join(root.dir, "update-manifest.json"))
    const have = new Map((active?.files ?? []).map((f) => [f.path, f.sha256]))
    const tmp = path.join(webDir(), `.tmp-${manifest.buildId}`)
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })

    for (const f of manifest.files) {
      if (!safeRelPath(f.path) || !/^[a-f0-9]{64}$/.test(f.sha256 || "")) throw new Error("bad manifest entry")
      const dest = path.join(tmp, f.path)
      if (!dest.startsWith(tmp + path.sep)) throw new Error("bad path")
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      const local = path.join(root.dir, f.path)
      if (have.get(f.path) === f.sha256 && fs.existsSync(local)) {
        fs.copyFileSync(local, dest) // unchanged since the build in use
      } else {
        const res = await get(f.path.split("/").map(encodeURIComponent).join("/"))
        if (!res.ok) throw new Error(`download failed: ${f.path}`)
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
      }
      const got = crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex")
      if (got !== f.sha256) throw new Error(`hash mismatch: ${f.path}`)
    }
    if (!fs.existsSync(path.join(tmp, "index.html"))) throw new Error("no index.html")
    fs.writeFileSync(path.join(tmp, "update-manifest.json"), text)
    fs.renameSync(tmp, target)
    fs.writeFileSync(path.join(webDir(), "current.json.tmp"), JSON.stringify({ buildId: manifest.buildId }))
    fs.renameSync(path.join(webDir(), "current.json.tmp"), path.join(webDir(), "current.json"))
    pruneBuilds(manifest.buildId, root.buildId)
    announceUpdate()
  } catch (err) {
    console.error("update check failed:", err && err.message)
    pruneBuilds(root.buildId, readJson(path.join(webDir(), "current.json"))?.buildId) // drop the partial download
  } finally {
    checking = false
  }
}

/** Keeps the staged build and the one in use; clears anything older or half-downloaded. */
function pruneBuilds(...keep) {
  try {
    for (const name of fs.readdirSync(webDir())) {
      const full = path.join(webDir(), name)
      if (name === "current.json") continue
      if (name.startsWith(".tmp-") || (BUILD_ID.test(name) && !keep.includes(name))) fs.rmSync(full, { recursive: true, force: true })
    }
  } catch {
    // nothing to clean
  }
}

function announceUpdate() {
  if (process.env.SHOP_UPDATE_SILENT === "1" || !mainWindow) return
  void dialog
    .showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: "An update is ready",
      detail: "Restart Shop Manager to start using the latest version.",
    })
    .then(({ response }) => {
      if (response === 0) {
        app.relaunch()
        app.exit(0)
      }
    })
}

/** A downloaded build that won't even load is dropped; the bundled one takes over. */
function rollBackIfBroken() {
  if (root.bundled) return
  const broken = root.buildId
  fs.rmSync(path.join(webDir(), "current.json"), { force: true })
  if (broken) fs.rmSync(path.join(webDir(), broken), { recursive: true, force: true })
  root = chooseRoot()
  void mainWindow?.loadURL(`${SCHEME}://${HOST}/`)
}

// ---- choosing a printer ----------------------------------------------------
// Electron has no built-in picker for USB, serial or Bluetooth devices, so a
// small window lists what was found and the choice is handed back to the page.

let chooser = null

function openChooser({ title, hint, emptyText }) {
  if (chooser) chooser.close()
  const win = new BrowserWindow({
    parent: mainWindow ?? undefined,
    modal: !!mainWindow,
    width: 420,
    height: 460,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    title,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
  })
  win.removeMenu()
  win.loadFile(path.join(__dirname, "chooser.html"))
  let settled = false
  let items = []
  let resolveFn
  const result = new Promise((resolve) => (resolveFn = resolve))
  const finish = (id) => {
    if (settled) return
    settled = true
    ipcMain.removeListener("chooser:pick", onPick)
    ipcMain.removeListener("chooser:cancel", onCancel)
    resolveFn(id)
    if (!win.isDestroyed()) win.close()
    if (chooser === handle) chooser = null
  }
  const onPick = (event, id) => event.sender === win.webContents && finish(id)
  const onCancel = (event) => event.sender === win.webContents && finish(null)
  ipcMain.on("chooser:pick", onPick)
  ipcMain.on("chooser:cancel", onCancel)
  win.on("closed", () => finish(null))
  const push = () => win.webContents.send("chooser:list", { title, hint, emptyText, items })
  win.webContents.on("did-finish-load", push)
  const handle = {
    result,
    update(next) {
      items = next
      if (!win.webContents.isLoading()) push()
    },
    close: () => finish(null),
  }
  chooser = handle
  return handle
}

const HEX = (n) => (n ?? 0).toString(16).padStart(4, "0")

function setupDevices(ses) {
  const ours = (origin) => !origin || origin.startsWith(`${SCHEME}://`)
  ses.setPermissionCheckHandler((_wc, permission, origin) =>
    ours(origin) && ["usb", "serial", "bluetooth", "clipboard-sanitized-write", "fullscreen"].includes(permission),
  )
  ses.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(["usb", "serial", "bluetooth", "clipboard-sanitized-write", "fullscreen"].includes(permission)),
  )
  // Devices the person picked once stay usable without asking again.
  ses.setDevicePermissionHandler((details) => ours(details.origin) && ["usb", "serial"].includes(details.deviceType))

  ses.on("select-usb-device", async (event, details, callback) => {
    event.preventDefault()
    const picker = openChooser({
      title: "Choose a USB printer",
      hint: "Plug the printer in and switch it on.",
      emptyText: "No USB devices found. Check the cable and that the printer is on.",
    })
    picker.update(
      details.deviceList.map((d) => ({
        id: d.deviceId,
        name: d.productName || "USB device",
        detail: [d.manufacturerName, `${HEX(d.vendorId)}:${HEX(d.productId)}`].filter(Boolean).join(" · "),
      })),
    )
    const id = await picker.result
    id ? callback(id) : callback()
  })

  ses.on("select-serial-port", async (event, portList, _wc, callback) => {
    event.preventDefault()
    const picker = openChooser({
      title: "Choose a printer port",
      hint: "A Bluetooth printer shows here once it is paired in the computer's Bluetooth settings.",
      emptyText: "No ports found. Pair the printer in Bluetooth settings first, then try again.",
    })
    picker.update(
      portList.map((p) => ({
        id: p.portId,
        name: p.displayName || p.portName,
        detail: p.portName,
      })),
    )
    const id = await picker.result
    callback(id ?? "")
  })
}

function setupBluetooth(win) {
  win.webContents.on("select-bluetooth-device", (event, deviceList, callback) => {
    event.preventDefault()
    // Fires again as more printers are found, each time with the full list.
    if (!win.__btPicker) {
      const picker = openChooser({
        title: "Choose a Bluetooth printer",
        hint: "Searching… switch the printer on and keep it close.",
        emptyText: "Searching for printers…",
      })
      win.__btPicker = picker
      picker.result.then((id) => {
        win.__btPicker = null
        win.__btCallback(id ?? "")
      })
    }
    win.__btCallback = callback
    win.__btPicker.update(
      deviceList
        .filter((d) => d.deviceName)
        .map((d) => ({ id: d.deviceId, name: d.deviceName, detail: d.deviceId })),
    )
  })
}

// ---- the window ---------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 600,
    backgroundColor: "#f5f6fa",
    autoHideMenuBar: true,
    title: "Shop Manager",
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  })
  setupBluetooth(mainWindow)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Invoices open in their own window; real web links go to the browser.
    if (url.startsWith("blob:") || url.startsWith(`${SCHEME}://`)) return { action: "allow" }
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${SCHEME}://`)) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })
  mainWindow.webContents.on("did-fail-load", (_e, _code, _desc, url, isMainFrame) => {
    if (isMainFrame && url.startsWith(`${SCHEME}://`)) rollBackIfBroken()
  })
  mainWindow.webContents.on("render-process-gone", () => rollBackIfBroken())
  mainWindow.on("closed", () => (mainWindow = null))
  void mainWindow.loadURL(`${SCHEME}://${HOST}/`)
}

function buildMenu() {
  const mac = process.platform === "darwin"
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: "appMenu" }] : []),
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
    ]),
  )
}

app.whenReady().then(() => {
  fs.mkdirSync(webDir(), { recursive: true })
  root = chooseRoot()
  pruneBuilds(root.buildId, readJson(path.join(webDir(), "current.json"))?.buildId)
  serveApp()
  setupDevices(session.defaultSession)
  buildMenu()
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  // Look for a newer web build shortly after start, then every few hours.
  setTimeout(() => void checkForUpdate(), 15000)
  setInterval(() => void checkForUpdate(), 3 * 60 * 60 * 1000)
})

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
