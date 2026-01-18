const { contextBridge, ipcRenderer } = require('electron');

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Printer Functions
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    printSilent: (options) => ipcRenderer.invoke('print-silent', options),

    // Price Audit Functions
    startPriceAudit: (options) => ipcRenderer.invoke('start-price-audit', options),
    pausePriceAudit: () => ipcRenderer.invoke('pause-price-audit'),
    stopPriceAudit: () => ipcRenderer.invoke('stop-price-audit'),
    getPriceAuditStatus: () => ipcRenderer.invoke('get-price-audit-status'),

    // Price Audit Event Listeners
    onPriceAuditProgress: (callback) => {
        ipcRenderer.on('price-audit-progress', (event, data) => callback(data));
    },
    onPriceAuditResult: (callback) => {
        ipcRenderer.on('price-audit-result', (event, data) => callback(data));
    },
    onPriceAuditComplete: (callback) => {
        ipcRenderer.on('price-audit-complete', (event, data) => callback(data));
    },
    onPriceAuditError: (callback) => {
        ipcRenderer.on('price-audit-error', (event, data) => callback(data));
    },

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
