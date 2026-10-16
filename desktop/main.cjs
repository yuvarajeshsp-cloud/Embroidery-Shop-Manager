const { app, BrowserWindow, Menu, ipcMain, net, protocol, session, shell } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

// The built web app is served from a private app:// address, so it behaves like
// a normal secure website (service storage, IndexedDB, fetch) without a server.
const SCHEME = "app"
const HOST = "shop"
const ROOT = path.join(__dirname, "app")

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
    const file = path.join(ROOT, wanted)
    if (!file.startsWith(ROOT)) return new Response("Forbidden", { status: 403 })
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return net.fetch(pathToFileURL(file).href)
    // A missing file with an extension is a real 404; anything else is a page inside the app.
    if (path.extname(wanted)) return new Response("Not found", { status: 404 })
    return net.fetch(pathToFileURL(path.join(ROOT, "index.html")).href)
  })
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
  serveApp()
  setupDevices(session.defaultSession)
  buildMenu()
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
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
