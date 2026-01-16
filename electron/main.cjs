const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Farmacias Vallenar Suit",
        autoHideMenuBar: true, // Native app feel
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        },
    });

    // URL OFICIAL DE PRODUCCIÓN
    // En desarrollo local, podrías querer cambiar esto a localhost si estás probando offline
    // const startUrl = process.env.ELECTRON_START_URL || 'https://farmaciasvallenar.vercel.app';
    const startUrl = 'https://farmaciasvallenar.vercel.app';

    win.loadURL(startUrl);

    // Open external links in default browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        // Permitir popups de impresión si no son de la app principal (aunque usamos silent print)
        if (url.startsWith('https:')) {
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });
}

// ---------------------------------------------------------
// IPC Handlers for Desktop Features
// ---------------------------------------------------------

ipcMain.handle('print-silent', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window found' };

    try {
        // Imprimir silenciosamente a la impresora predeterminada
        await win.webContents.print({
            silent: true,
            printBackground: true,
            deviceName: '' // Empty string triggers default printer
        });
        return { success: true };
    } catch (error) {
        console.error('Silent print failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
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

