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
    isElectron: true,

    // ─────────────────────────────────────────────
    // OFFLINE DATABASE API
    // ─────────────────────────────────────────────
    offlineDB: {
        getAll: (table, where, orderBy) =>
            ipcRenderer.invoke('offline-db-get-all', { table, where, orderBy }),
        getById: (table, id) =>
            ipcRenderer.invoke('offline-db-get-by-id', { table, id }),
        upsert: (table, data) =>
            ipcRenderer.invoke('offline-db-upsert', { table, data }),
        upsertMany: (table, rows) =>
            ipcRenderer.invoke('offline-db-upsert-many', { table, rows }),
        delete: (table, id) =>
            ipcRenderer.invoke('offline-db-delete', { table, id }),
        count: (table, where) =>
            ipcRenderer.invoke('offline-db-count', { table, where }),
        query: (sql, params) =>
            ipcRenderer.invoke('offline-db-query', { sql, params }),
    },

    // ─────────────────────────────────────────────
    // SYNC API
    // ─────────────────────────────────────────────
    sync: {
        getStatus: () =>
            ipcRenderer.invoke('offline-db-get-sync-status'),
        forceSync: () =>
            ipcRenderer.invoke('offline-db-force-sync'),
        enqueue: (table, operation, recordId, payload) =>
            ipcRenderer.invoke('offline-db-enqueue-sync', { table, operation, recordId, payload }),

        // Listen for sync status updates from main process
        onStatusUpdate: (callback) => {
            ipcRenderer.on('sync-status-update', (event, data) => callback(data));
        },
        // Listen for sync push requests from main process
        onPushRequest: (callback) => {
            ipcRenderer.on('sync-push-request', (event, data) => callback(data));
        },
        // Listen for sync pull requests from main process
        onPullRequest: (callback) => {
            ipcRenderer.on('sync-pull-request', (event, data) => callback(data));
        },
        // Send pull response back to main process
        sendPullResponse: (table, rows) => {
            ipcRenderer.send('sync-pull-response', { table, rows });
        },
    },

    // ─────────────────────────────────────────────
    // BACKUP API
    // ─────────────────────────────────────────────
    backup: {
        create: () =>
            ipcRenderer.invoke('backup-create'),
        list: () =>
            ipcRenderer.invoke('backup-list'),
        restore: (filename) =>
            ipcRenderer.invoke('backup-restore', { filename }),
        getDir: () =>
            ipcRenderer.invoke('backup-get-dir'),
    },
});

// Legacy support (backwards compatibility)
contextBridge.exposeInMainWorld('DesktopApp', {
    printSilent: (options) => ipcRenderer.invoke('print-silent', options),
    getVersion: () => ipcRenderer.invoke('get-app-version')
});
