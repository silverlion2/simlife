const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Steam', {
  getName: () => ipcRenderer.invoke('steam-get-name'),
  activateAchievement: (achId) => ipcRenderer.invoke('steam-activate-achievement', achId)
});
