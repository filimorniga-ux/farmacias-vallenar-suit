const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// ---------------------------------------------------------
// LOGGING CONFIGURATION
// ---------------------------------------------------------
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

log.info('App starting...');

// ---------------------------------------------------------
// GLOBAL ERROR HANDLERS
// ---------------------------------------------------------
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection:', reason);
});

// ---------------------------------------------------------
// AUTO-UPDATER CONFIGURATION
// ---------------------------------------------------------
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let retryCount = 0;
const MAX_RETRIES = 3;

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Farmacias Vallenar Suit",
        autoHideMenuBar: true, // Native app feel
        show: false, // Don't show until ready
        backgroundColor: '#f8fafc',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: false, // Required for some integrations
            devTools: true  // Enable DevTools for debugging
        },
    });

    // Maximize on start for better experience
    win.maximize();
    win.show();

    // HANDLE RENDER PROCESS CRASHES
    win.webContents.on('render-process-gone', (event, details) => {
        log.error('Render process gone:', details);
        dialog.showMessageBox(win, {
            type: 'error',
            title: 'Error Crítico',
            message: 'La aplicación ha encontrado un error inesperado.',
            detail: `Razón: ${details.reason}`,
            buttons: ['Reiniciar', 'Salir']
        }).then(({ response }) => {
            if (response === 0) {
                app.relaunch();
                app.exit(0);
            } else {
                app.quit();
            }
        });
    });

    // URL CONFIGURATION
    const isDev = !app.isPackaged;
    const startUrl = isDev ? 'http://localhost:3000' : 'https://farmaciasvallenar.vercel.app';
    log.info('Loading URL:', startUrl);

    // Handle loading errors with retry logic
    const loadContent = () => {
        win.loadURL(startUrl).catch(err => {
            log.error(`Failed to load URL (Attempt ${retryCount + 1}/${MAX_RETRIES}):`, err);

            if (retryCount < MAX_RETRIES) {
                retryCount++;
                setTimeout(loadContent, 5000 * retryCount); // Exponential backoff-ish
            } else {
                dialog.showMessageBox(win, {
                    type: 'error',
                    title: 'Error de Conexión',
                    message: 'No se pudo conectar con el servidor de Farmacias Vallenar tras varios intentos.',
                    detail: 'Por favor verifique su conexión a internet.',
                    buttons: ['Reintentar', 'Salir']
                }).then(({ response }) => {
                    if (response === 0) { // Retry
                        retryCount = 0;
                        loadContent();
                    } else {
                        app.quit();
                    }
                });
            }
        });
    };

    loadContent();

    // Check for updates once window is loaded
    win.webContents.on('did-finish-load', () => {
        log.info('Page loaded successfully');
        retryCount = 0; // Reset retry count on success
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
        }
    });

    // Handle specific load failures (e.g. timeout, DNS error)
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        log.warn('Page failed to load:', errorCode, errorDescription);
        // Retry logic is handled by loadURL catch, but this logs specific network errors
    });

    // Open external links in default browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) {
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // ----------------------------------------------------------------
    // RELOAD SHORTCUT: Ctrl+R / F5
    // ----------------------------------------------------------------
    globalShortcut.register('CommandOrControl+R', () => {
        win.reload();
    });

    // DEBUG SHORTCUT: Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (Mac)
    // ----------------------------------------------------------------
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        win.webContents.toggleDevTools();
    });
}

// ---------------------------------------------------------
// IPC Handlers for Desktop Features
// ---------------------------------------------------------

// Get list of available printers
ipcMain.handle('get-printers', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return [];

    try {
        const printers = await win.webContents.getPrintersAsync();
        return printers.map(p => ({
            name: p.name,
            isDefault: p.isDefault,
            status: p.status
        }));
    } catch (error) {
        log.error('Failed to get printers:', error);
        return [];
    }
});

// Silent print to specific printer
ipcMain.handle('print-silent', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window found' };

    try {
        // If HTML content provided, we need to print the current page
        // For now, we use the browser's print with silent mode
        const printOptions = {
            silent: true,
            printBackground: true,
            deviceName: options?.printerName || ''
        };

        await win.webContents.print(printOptions);
        log.info('Print job sent successfully');
        return { success: true };
    } catch (error) {
        log.error('Silent print failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// ---------------------------------------------------------
// PRICE AUDIT IPC HANDLERS
// ---------------------------------------------------------
const priceAuditEngine = require('./priceAuditEngine.cjs');

// Start price audit for a batch
ipcMain.handle('start-price-audit', async (event, { batchId, products, startOffset }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window found' };

    try {
        log.info(`Starting price audit for batch ${batchId}`);
        // Run audit in background (non-blocking)
        priceAuditEngine.runAudit(win, batchId, products, startOffset || 0);
        return { success: true, message: 'Audit started' };
    } catch (error) {
        log.error('Failed to start price audit:', error);
        return { success: false, error: error.message };
    }
});

// Pause current audit
ipcMain.handle('pause-price-audit', () => {
    log.info('Pausing price audit');
    return priceAuditEngine.pauseAudit();
});

// Stop current audit
ipcMain.handle('stop-price-audit', () => {
    log.info('Stopping price audit');
    return priceAuditEngine.stopAudit();
});

// Get audit status
ipcMain.handle('get-price-audit-status', () => {
    return priceAuditEngine.getStatus();
});

// ---------------------------------------------------------
// AUTO-UPDATER EVENTS
// ---------------------------------------------------------
autoUpdater.on('update-available', () => {
    log.info('Update available');
});

autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded');
    dialog.showMessageBox({
        type: 'info',
        title: 'Actualización Lista',
        message: 'Una nueva versión ha sido descargada. Se instalará al cerrar la aplicación.',
        buttons: ['Ok']
    });
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    // Unregister shortcuts
    globalShortcut.unregisterAll();
});

