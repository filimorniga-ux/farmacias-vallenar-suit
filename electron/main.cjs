const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// ---------------------------------------------------------
// AUTO-UPDATER CONFIGURATION
// ---------------------------------------------------------
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

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

    // URL CONFIGURATION
    const isDev = !app.isPackaged;
    const startUrl = isDev ? 'http://localhost:3000' : 'https://farmaciasvallenar.vercel.app';
    console.log('Loading URL:', startUrl);

    // Handle loading errors with retry dialog
    const loadContent = () => {
        win.loadURL(startUrl).catch(err => {
            console.error('Failed to load URL:', err);
            dialog.showMessageBox(win, {
                type: 'error',
                title: 'Error de Conexión',
                message: 'No se pudo conectar con el servidor de Farmacias Vallenar.',
                detail: 'Por favor verifique su conexión a internet.',
                buttons: ['Reintentar', 'Salir']
            }).then(({ response }) => {
                if (response === 0) { // Retry
                    loadContent();
                } else {
                    app.quit();
                }
            });
        });
    };

    loadContent();

    // Check for updates once window is loaded
    // Check for updates once window is loaded
    win.webContents.on('did-finish-load', () => {
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
        }
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
        console.error('Failed to get printers:', error);
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
        return { success: true };
    } catch (error) {
        console.error('Silent print failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// ---------------------------------------------------------
// AUTO-UPDATER EVENTS
// ---------------------------------------------------------
autoUpdater.on('update-available', () => {
    // Notify renderer or just log
    console.log('Update available');
});

autoUpdater.on('update-downloaded', () => {
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

