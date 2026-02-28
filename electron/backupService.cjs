/**
 * backupService.cjs — Backup Automático cada 30 minutos
 *
 * Crea copias de seguridad de la base de datos SQLite en disco local.
 * Ubicaciones:
 *   Mac:     ~/Library/Application Support/FarmaciasVallenar/backups/
 *   Windows: %APPDATA%/FarmaciasVallenar/backups/
 *
 * Política de rotación: máximo 48 backups (24 horas).
 * Backups > 2 horas se comprimen con gzip.
 */

const path = require('path');
const fs = require('fs');
const { createGzip } = require('zlib');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { app } = require('electron');
const log = require('electron-log');
const offlineDB = require('./offlineDB.cjs');

const pipe = promisify(pipeline);

const BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_BACKUPS = 48; // 24 horas de backups
const COMPRESS_AFTER_MS = 2 * 60 * 60 * 1000; // Comprimir backups > 2 horas

let _timer = null;
let _isRunning = false;

// ─────────────────────────────────────────────────
// PATHS
// ─────────────────────────────────────────────────
function getBackupDir() {
    const userDataPath = app.getPath('userData');
    const backupDir = path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
}

// ─────────────────────────────────────────────────
// BACKUP CORE
// ─────────────────────────────────────────────────

/**
 * Crea un backup completo de la base de datos SQLite.
 * Usa el comando VACUUM INTO de SQLite para crear una copia atómica.
 */
async function createBackup() {
    const db = offlineDB.getDB();
    if (!db) {
        log.warn('[Backup] No database available, skipping backup');
        return null;
    }

    try {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .slice(0, 19);

        const filename = `backup_${timestamp}.db`;
        const backupDir = getBackupDir();
        const backupPath = path.join(backupDir, filename);

        // sql.js: export DB as Uint8Array and write to disk
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(backupPath, buffer);

        const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

        // Log the backup in the database
        offlineDB.rawExec(
            `INSERT INTO backup_log (filename, size_bytes, tables_included, created_at)
             VALUES (?, ?, ?, datetime('now', 'localtime'))`,
            [filename, buffer.length, JSON.stringify(['sales', 'inventory_batches', 'cash_sessions', 'wms_movements', 'products'])]
        );

        log.info(`[Backup] ✅ Created: ${filename} (${sizeMB} MB)`);

        // Post-backup tasks
        await rotateBackups();
        await compressOldBackups();

        return { filename, size: buffer.length, path: backupPath };
    } catch (err) {
        log.error('[Backup] ❌ Failed to create backup:', err);
        return null;
    }
}

/**
 * Elimina backups antiguos si exceden la cantidad máxima.
 * Mantiene los MAX_BACKUPS más recientes.
 */
async function rotateBackups() {
    const backupDir = getBackupDir();
    const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup_') && (f.endsWith('.db') || f.endsWith('.db.gz')))
        .sort()
        .reverse();

    if (files.length <= MAX_BACKUPS) return;

    const toDelete = files.slice(MAX_BACKUPS);
    for (const file of toDelete) {
        const filePath = path.join(backupDir, file);
        fs.unlinkSync(filePath);
        log.info(`[Backup] 🗑️ Rotated (deleted): ${file}`);
    }
}

/**
 * Comprime backups que tienen más de 2 horas usando gzip.
 */
async function compressOldBackups() {
    const backupDir = getBackupDir();
    const now = Date.now();

    const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup_') && f.endsWith('.db'));

    for (const file of files) {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > COMPRESS_AFTER_MS) {
            try {
                const gzPath = filePath + '.gz';
                const source = fs.createReadStream(filePath);
                const destination = fs.createWriteStream(gzPath);
                const gzip = createGzip({ level: 6 });

                await pipe(source, gzip, destination);
                fs.unlinkSync(filePath);

                log.info(`[Backup] 📦 Compressed: ${file} → ${file}.gz`);
            } catch (err) {
                log.error(`[Backup] Failed to compress ${file}:`, err);
            }
        }
    }
}

// ─────────────────────────────────────────────────
// RESTORE
// ─────────────────────────────────────────────────

/**
 * Restaura la base de datos desde un backup.
 * @param {string} filename - Nombre del archivo de backup
 */
async function restoreFromBackup(filename) {
    const backupDir = getBackupDir();
    let backupPath = path.join(backupDir, filename);

    if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup not found: ${filename}`);
    }

    // If compressed, decompress first
    if (filename.endsWith('.gz')) {
        const { createGunzip } = require('zlib');
        const tempPath = backupPath.replace('.gz', '');
        const source = fs.createReadStream(backupPath);
        const destination = fs.createWriteStream(tempPath);
        const gunzip = createGunzip();
        await pipe(source, gunzip, destination);
        backupPath = tempPath;
    }

    // Close current DB
    offlineDB.closeDB();

    // Replace current DB file with backup
    const currentDBPath = offlineDB.getDBPath();
    fs.copyFileSync(backupPath, currentDBPath);

    // Reopen DB (sql.js async init)
    await offlineDB.initDB();

    log.info(`[Backup] ♻️ Restored from: ${filename}`);

    // Clean temp file if decompressed
    if (filename.endsWith('.gz')) {
        const tempPath = backupPath;
        if (fs.existsSync(tempPath) && tempPath !== currentDBPath) {
            fs.unlinkSync(tempPath);
        }
    }

    return true;
}

/**
 * Lista todos los backups disponibles.
 */
function listBackups() {
    const backupDir = getBackupDir();

    if (!fs.existsSync(backupDir)) return [];

    return fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup_') && (f.endsWith('.db') || f.endsWith('.db.gz')))
        .sort()
        .reverse()
        .map(filename => {
            const filePath = path.join(backupDir, filename);
            const stats = fs.statSync(filePath);
            return {
                filename,
                path: filePath,
                size: stats.size,
                sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
                createdAt: stats.mtime.toISOString(),
                compressed: filename.endsWith('.gz'),
            };
        });
}

// ─────────────────────────────────────────────────
// TIMER
// ─────────────────────────────────────────────────

/** Start the automatic backup timer */
function start() {
    if (_isRunning) {
        log.warn('[Backup] Timer already running');
        return;
    }

    _isRunning = true;

    // Run first backup after 2 minutes (let the app stabilize)
    setTimeout(() => {
        createBackup();
    }, 2 * 60 * 1000);

    // Then every 30 minutes
    _timer = setInterval(() => {
        createBackup();
    }, BACKUP_INTERVAL_MS);

    log.info(`[Backup] ⏰ Timer started (every ${BACKUP_INTERVAL_MS / 60000} min)`);
}

/** Stop the automatic backup timer */
function stop() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
    _isRunning = false;
    log.info('[Backup] Timer stopped');
}

// ─────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────
module.exports = {
    createBackup,
    restoreFromBackup,
    listBackups,
    getBackupDir,
    start,
    stop,
};
