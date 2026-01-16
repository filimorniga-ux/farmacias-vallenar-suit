const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('DesktopApp', {
    printSilent: (options) => ipcRenderer.invoke('print-silent', options),
    getVersion: () => ipcRenderer.invoke('get-app-version')
});
