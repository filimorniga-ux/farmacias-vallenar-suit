/**
 * syncService.cjs — Servicio de Sincronización Offline ↔ Online
 *
 * Gestiona la sincronización bidireccional entre SQLite local y Supabase.
 * Usa cola FIFO para operaciones pendientes y pull periódico para
 * datos de referencia (catálogo, precios, stock).
 *
 * Estrategia de conflictos (del skill sync-conflict-resolver):
 *   - Ventas:         Push-only (nunca se sobreescriben)
 *   - Inventario:     Server-wins al sincronizar
 *   - Precios:        Precio local se respeta + flag price_override
 *   - Clientes:       Merge inteligente (últimos modificados ganan)
 *   - Caja:           Push-only
 *   - Configuración:  Last-write-wins
 */

const { net } = require('electron');
const log = require('electron-log');
const offlineDB = require('./offlineDB.cjs');

// ─────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────
let _isOnline = false;
let _isSyncing = false;
let _syncTimer = null;
let _connectivityTimer = null;
let _mainWindow = null;

const SYNC_INTERVAL_MS = 60 * 1000; // Check sync every 60 seconds
const CONNECTIVITY_CHECK_MS = 10 * 1000; // Check connectivity every 10 seconds
const PULL_INTERVAL_MS = 5 * 60 * 1000; // Pull reference data every 5 minutes

let _lastPullTime = 0;

// ─────────────────────────────────────────────────
// CONNECTIVITY
// ─────────────────────────────────────────────────

/** Check if we have internet connectivity */
function checkConnectivity() {
    return new Promise((resolve) => {
        try {
            const isOnline = net.isOnline();
            resolve(isOnline);
        } catch (err) {
            log.warn('[Sync] Connectivity check failed:', err.message);
            resolve(false);
        }
    });
}

/** Update connectivity status and notify renderer */
async function updateConnectivityStatus() {
    const wasOnline = _isOnline;
    _isOnline = await checkConnectivity();

    // Status changed
    if (wasOnline !== _isOnline) {
        log.info(`[Sync] Connectivity changed: ${wasOnline ? '🟢' : '🔴'} → ${_isOnline ? '🟢' : '🔴'}`);

        notifyRenderer({
            type: 'connectivity-change',
            isOnline: _isOnline,
        });

        // Just came back online — trigger sync
        if (_isOnline && !wasOnline) {
            log.info('[Sync] 🟢 Back online — triggering sync...');
            setTimeout(() => processQueue(), 2000);
        }
    }
}

// ─────────────────────────────────────────────────
// PUSH: Local → Server (Cola FIFO)
// ─────────────────────────────────────────────────

/** Process the sync queue (push pending items to server) */
async function processQueue() {
    if (_isSyncing) {
        log.debug('[Sync] Already syncing, skipping...');
        return;
    }

    if (!_isOnline) {
        log.debug('[Sync] Offline, skipping push...');
        return;
    }

    _isSyncing = true;
    notifyRenderer({ type: 'sync-status', status: 'syncing' });

    try {
        // Retry previously failed items
        offlineDB.retryFailedItems(5);

        const pendingItems = offlineDB.getPendingSyncItems(50);

        if (pendingItems.length === 0) {
            log.debug('[Sync] No pending items');
            _isSyncing = false;
            notifyRenderer({ type: 'sync-status', status: 'idle', pending: 0 });
            return;
        }

        log.info(`[Sync] Processing ${pendingItems.length} pending items...`);
        notifyRenderer({ type: 'sync-status', status: 'syncing', pending: pendingItems.length });

        let successCount = 0;
        let failCount = 0;

        for (const item of pendingItems) {
            try {
                await pushItemToServer(item);
                offlineDB.markSyncCompleted(item.id);
                successCount++;
            } catch (err) {
                log.error(`[Sync] Failed to push item ${item.id}:`, err.message);
                offlineDB.markSyncFailed(item.id, err.message);
                failCount++;
            }
        }

        log.info(`[Sync] Push complete: ${successCount} success, ${failCount} failed`);

        // Update sync meta for affected tables
        const affectedTables = [...new Set(pendingItems.map(i => i.table_name))];
        for (const table of affectedTables) {
            offlineDB.updateSyncMeta(table);
        }

        notifyRenderer({
            type: 'sync-status',
            status: 'idle',
            lastSync: new Date().toISOString(),
            pending: offlineDB.count('sync_queue', { status: 'pending' }),
            success: successCount,
            failed: failCount,
        });
    } catch (err) {
        log.error('[Sync] Queue processing error:', err);
        notifyRenderer({ type: 'sync-status', status: 'error', error: err.message });
    } finally {
        _isSyncing = false;
    }
}

/**
 * Push a single sync item to the server.
 * This is a placeholder that sends the data via the renderer's
 * fetch API (since Electron main process doesn't have direct
 * access to the app's auth context).
 */
async function pushItemToServer(item) {
    if (!_mainWindow || _mainWindow.isDestroyed()) {
        throw new Error('No renderer window available');
    }

    const payload = JSON.parse(item.payload);

    // Send to renderer which will use Server Actions to push to Supabase
    return new Promise((resolve, reject) => {
        const channel = `sync-push-${item.id}`;

        const timeout = setTimeout(() => {
            reject(new Error('Push timeout (30s)'));
        }, 30000);

        _mainWindow.webContents.once(`ipc-message`, (event, ch, result) => {
            if (ch === channel) {
                clearTimeout(timeout);
                if (result.success) {
                    resolve(result);
                } else {
                    reject(new Error(result.error || 'Push failed'));
                }
            }
        });

        _mainWindow.webContents.send('sync-push-request', {
            id: item.id,
            channel,
            table: item.table_name,
            operation: item.operation,
            recordId: item.record_id,
            payload,
        });
    });
}

// ─────────────────────────────────────────────────
// PULL: Server → Local (Reference data)
// ─────────────────────────────────────────────────

/** Pull reference data from server (products, prices, users, etc.) */
async function pullReferenceData() {
    if (!_isOnline || !_mainWindow || _mainWindow.isDestroyed()) return;

    const now = Date.now();
    if (now - _lastPullTime < PULL_INTERVAL_MS) return;
    _lastPullTime = now;

    log.info('[Sync] 📥 Pulling reference data from server...');
    notifyRenderer({ type: 'sync-status', status: 'pulling' });

    try {
        // Request renderer to fetch latest data via Server Actions
        _mainWindow.webContents.send('sync-pull-request', {
            tables: ['locations', 'warehouses', 'terminals', 'users', 'products', 'inventory_batches', 'clients'],
        });
    } catch (err) {
        log.error('[Sync] Pull request failed:', err);
    }
}

/**
 * Handle pulled data from renderer.
 * Called when renderer responds with fresh data from Supabase.
 */
function handlePulledData(tableName, rows) {
    if (!rows || rows.length === 0) {
        log.debug(`[Sync] Pull: ${tableName} — no data`);
        return;
    }

    try {
        offlineDB.upsertMany(tableName, rows);
        offlineDB.updateSyncMeta(tableName);
        log.info(`[Sync] 📥 Pulled ${rows.length} rows into ${tableName}`);
    } catch (err) {
        log.error(`[Sync] Failed to store pulled data for ${tableName}:`, err);
    }
}

// ─────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────

/** Get current sync status */
function getStatus() {
    const pendingCount = offlineDB.count('sync_queue', { status: 'pending' });
    const failedCount = offlineDB.count('sync_queue', { status: 'failed' });
    const syncMeta = offlineDB.getSyncStatus();

    return {
        isOnline: _isOnline,
        isSyncing: _isSyncing,
        pendingItems: pendingCount,
        failedItems: failedCount,
        tables: syncMeta,
    };
}

// ─────────────────────────────────────────────────
// NOTIFY RENDERER
// ─────────────────────────────────────────────────

function notifyRenderer(data) {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('sync-status-update', data);
    }
}

// ─────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────

/** Start the sync service */
function start(mainWindow) {
    _mainWindow = mainWindow;

    // Start connectivity monitoring
    _connectivityTimer = setInterval(() => {
        updateConnectivityStatus();
    }, CONNECTIVITY_CHECK_MS);

    // Initial connectivity check
    updateConnectivityStatus();

    // Start sync timer
    _syncTimer = setInterval(() => {
        if (_isOnline) {
            processQueue();
            pullReferenceData();
        }
    }, SYNC_INTERVAL_MS);

    // Clean old completed items every hour
    setInterval(() => {
        offlineDB.cleanCompletedSync(24);
    }, 60 * 60 * 1000);

    log.info('[Sync] ⚡ Service started');
}

/** Stop the sync service */
function stop() {
    if (_syncTimer) {
        clearInterval(_syncTimer);
        _syncTimer = null;
    }
    if (_connectivityTimer) {
        clearInterval(_connectivityTimer);
        _connectivityTimer = null;
    }
    _mainWindow = null;
    log.info('[Sync] Service stopped');
}

// ─────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────
module.exports = {
    start,
    stop,
    processQueue,
    pullReferenceData,
    handlePulledData,
    getStatus,
    checkConnectivity,
};
