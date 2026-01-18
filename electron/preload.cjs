const { contextBridge, ipcRenderer } = require('electron');

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Printer Functions
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printSilent: (options) => ipcRenderer.invoke('print-silent', options),

    // App Info
    getVersion: () => ipcRenderer.invoke('get-app-version'),

    // Flag to identify Electron environment
    isElectron: true
});

// Legacy support (backwards compatibility)
contextBridge.exposeInMainWorld('DesktopApp', {
    printSilent: (options) => ipcRenderer.invoke('print-silent', options),
    getVersion: () => ipcRenderer.invoke('get-app-version')
});
