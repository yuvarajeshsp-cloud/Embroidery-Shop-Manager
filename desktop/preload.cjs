const { contextBridge, ipcRenderer } = require("electron")

// Only the device chooser window uses this.
contextBridge.exposeInMainWorld("chooser", {
  onList: (cb) => ipcRenderer.on("chooser:list", (_e, payload) => cb(payload)),
  pick: (id) => ipcRenderer.send("chooser:pick", id),
  cancel: () => ipcRenderer.send("chooser:cancel"),
})
