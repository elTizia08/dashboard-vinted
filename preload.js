const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("vt", {
  load: () => ipcRenderer.invoke("load"),
  sync: () => ipcRenderer.invoke("sync"),
  openDataFolder: () => ipcRenderer.invoke("open-data-folder")
});
