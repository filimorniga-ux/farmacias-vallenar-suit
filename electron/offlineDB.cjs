/**
 * offlineDB.cjs — Motor de Base de Datos Offline (sql.js / WASM)
 *
 * Gestiona la base de datos local para funcionamiento sin internet.
 * Usa sql.js (WASM) en lugar de better-sqlite3 para evitar compilación nativa.
 * Los datos se persisten automáticamente en disco cada N operaciones.
 *
 * Ubicaciones de la BD:
 *   Mac:     ~/Library/Application Support/FarmaciasVallenar/offline.db
 *   Windows: %APPDATA%/FarmaciasVallenar/offline.db
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const log = require('electron-log');

// ─────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────
let _db = null;
let _initialized = false;
let _changesSinceFlush = 0;
const FLUSH_THRESHOLD = 10; // Auto-flush to disk every 10 writes

function getDBPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'offline.db');
}

/** Initialize SQL.js and load/create the database */
async function initDB() {
    if (_initialized && _db) return _db;

    try {
        const initSqlJs = require('sql.js');
        const SQL = await initSqlJs();

        const dbPath = getDBPath();
        log.info(`[OfflineDB] Opening database at: ${dbPath}`);

        // Load existing database or create new
        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            _db = new SQL.Database(fileBuffer);
            log.info('[OfflineDB] Loaded existing database');
        } else {
            _db = new SQL.Database();
            log.info('[OfflineDB] Created new database');
        }

        // Performance optimizations
        _db.run('PRAGMA journal_mode = WAL');
        _db.run('PRAGMA synchronous = NORMAL');
        _db.run('PRAGMA cache_size = -64000');
        _db.run('PRAGMA foreign_keys = ON');

        initializeSchema();
        flushToDisk(); // Save initial schema
        _initialized = true;
        log.info('[OfflineDB] Database initialized successfully');
    } catch (err) {
        log.error('[OfflineDB] Failed to initialize:', err);
        _db = null;
    }

    return _db;
}

function getDB() {
    return _db;
}

function closeDB() {
    if (_db) {
        flushToDisk();
        _db.close();
        _db = null;
        _initialized = false;
        log.info('[OfflineDB] Database closed');
    }
}

/** Persist the in-memory database to disk */
function flushToDisk() {
    if (!_db) return;
    try {
        const data = _db.export();
        const buffer = Buffer.from(data);
        const dbPath = getDBPath();
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dbPath, buffer);
        _changesSinceFlush = 0;
    } catch (err) {
        log.error('[OfflineDB] Failed to flush to disk:', err);
    }
}

/** Auto-flush after write operations */
function autoFlush() {
    _changesSinceFlush++;
    if (_changesSinceFlush >= FLUSH_THRESHOLD) {
        flushToDisk();
    }
}

// ─────────────────────────────────────────────────
// SCHEMA — Tablas espejo de Supabase (28 tablas)
// ─────────────────────────────────────────────────
function initializeSchema() {
    _db.run(`
        -- META: Control de sincronización
        CREATE TABLE IF NOT EXISTS sync_meta (
            table_name TEXT PRIMARY KEY,
            last_synced_at TEXT,
            last_server_timestamp TEXT,
            row_count INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
            record_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            retry_count INTEGER DEFAULT 0,
            last_error TEXT,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'failed', 'completed'))
        );
        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

        -- AUTH
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, rut TEXT, email TEXT,
            pin_hash TEXT, role TEXT NOT NULL DEFAULT 'vendedor', location_id TEXT,
            is_active INTEGER DEFAULT 1, avatar_url TEXT, permissions TEXT, updated_at TEXT
        );

        -- LOCATIONS
        CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, city TEXT,
            phone TEXT, is_active INTEGER DEFAULT 1, config TEXT, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS warehouses (
            id TEXT PRIMARY KEY, location_id TEXT NOT NULL, name TEXT NOT NULL,
            type TEXT DEFAULT 'main', is_active INTEGER DEFAULT 1, updated_at TEXT,
            FOREIGN KEY (location_id) REFERENCES locations(id)
        );
        CREATE TABLE IF NOT EXISTS terminals (
            id TEXT PRIMARY KEY, location_id TEXT NOT NULL, name TEXT NOT NULL,
            type TEXT DEFAULT 'pos', is_active INTEGER DEFAULT 1, updated_at TEXT,
            FOREIGN KEY (location_id) REFERENCES locations(id)
        );

        -- PRODUCTS
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY, sku TEXT, barcode TEXT, name TEXT NOT NULL,
            generic_name TEXT, lab TEXT, category TEXT,
            requires_prescription INTEGER DEFAULT 0, is_controlled INTEGER DEFAULT 0,
            is_refrigerated INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1,
            unit_of_measure TEXT DEFAULT 'unidad', tax_rate REAL DEFAULT 0.19, updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
        CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
        CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

        CREATE TABLE IF NOT EXISTS inventory_batches (
            id TEXT PRIMARY KEY, product_id TEXT NOT NULL, location_id TEXT NOT NULL,
            warehouse_id TEXT, batch_number TEXT, expiry_date TEXT,
            quantity INTEGER DEFAULT 0, reserved_quantity INTEGER DEFAULT 0,
            cost_price REAL DEFAULT 0, sell_price REAL DEFAULT 0, updated_at TEXT,
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (location_id) REFERENCES locations(id)
        );
        CREATE INDEX IF NOT EXISTS idx_batches_product ON inventory_batches(product_id);
        CREATE INDEX IF NOT EXISTS idx_batches_location ON inventory_batches(location_id);
        CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date);

        -- POS: Ventas
        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY, location_id TEXT NOT NULL, terminal_id TEXT,
            cashier_id TEXT, customer_id TEXT,
            subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0,
            discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
            payment_method TEXT DEFAULT 'cash', payment_details TEXT,
            status TEXT DEFAULT 'completed', notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            synced INTEGER DEFAULT 0,
            FOREIGN KEY (location_id) REFERENCES locations(id)
        );
        CREATE TABLE IF NOT EXISTS sale_items (
            id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, product_id TEXT NOT NULL,
            batch_id TEXT, product_name TEXT,
            quantity INTEGER NOT NULL, unit_price REAL NOT NULL,
            discount REAL DEFAULT 0, tax REAL DEFAULT 0, total REAL NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sales_location ON sales(location_id);
        CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
        CREATE INDEX IF NOT EXISTS idx_sales_synced ON sales(synced);
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

        -- CAJA
        CREATE TABLE IF NOT EXISTS cash_sessions (
            id TEXT PRIMARY KEY, location_id TEXT NOT NULL, terminal_id TEXT,
            cashier_id TEXT NOT NULL, authorized_by TEXT,
            opening_amount REAL NOT NULL DEFAULT 0, closing_amount REAL,
            expected_amount REAL, difference REAL,
            status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
            opened_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT, notes TEXT, synced INTEGER DEFAULT 0,
            FOREIGN KEY (location_id) REFERENCES locations(id)
        );
        CREATE TABLE IF NOT EXISTS cash_movements (
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('sale', 'refund', 'withdrawal', 'deposit', 'expense')),
            amount REAL NOT NULL, description TEXT, reference_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            created_by TEXT, synced INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES cash_sessions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);

        -- WMS
        CREATE TABLE IF NOT EXISTS wms_movements (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK (type IN ('reception', 'dispatch', 'transfer', 'adjustment', 'return')),
            source_location_id TEXT, destination_location_id TEXT,
            source_warehouse_id TEXT, destination_warehouse_id TEXT,
            product_id TEXT NOT NULL, batch_id TEXT, quantity INTEGER NOT NULL,
            reason TEXT, reference_doc TEXT, created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            synced INTEGER DEFAULT 0,
            FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_wms_type ON wms_movements(type);
        CREATE INDEX IF NOT EXISTS idx_wms_synced ON wms_movements(synced);

        -- CRM
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, rut TEXT, email TEXT,
            phone TEXT, address TEXT, birth_date TEXT,
            loyalty_points INTEGER DEFAULT 0, notes TEXT,
            is_active INTEGER DEFAULT 1, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS client_transactions (
            id TEXT PRIMARY KEY, client_id TEXT NOT NULL, type TEXT NOT NULL,
            points INTEGER DEFAULT 0, amount REAL DEFAULT 0, reference_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            synced INTEGER DEFAULT 0,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        );

        -- RRHH
        CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, rut TEXT,
            position TEXT, department TEXT, contract_type TEXT,
            hire_date TEXT, salary REAL, is_active INTEGER DEFAULT 1,
            data TEXT, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS attendance (
            id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, date TEXT NOT NULL,
            check_in TEXT, check_out TEXT, hours_worked REAL,
            status TEXT DEFAULT 'present', notes TEXT, synced INTEGER DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );

        -- HORARIOS
        CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY, location_id TEXT NOT NULL, employee_id TEXT NOT NULL,
            date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
            type TEXT DEFAULT 'regular', status TEXT DEFAULT 'scheduled',
            notes TEXT, updated_at TEXT, synced INTEGER DEFAULT 0,
            FOREIGN KEY (location_id) REFERENCES locations(id),
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );

        -- TESORERÍA
        CREATE TABLE IF NOT EXISTS treasury_accounts (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
            balance REAL DEFAULT 0, currency TEXT DEFAULT 'CLP',
            is_active INTEGER DEFAULT 1, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS treasury_movements (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
            amount REAL NOT NULL, description TEXT, category TEXT,
            reference_id TEXT, created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            synced INTEGER DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES treasury_accounts(id)
        );

        -- CIERRE MENSUAL
        CREATE TABLE IF NOT EXISTS monthly_closings (
            id TEXT PRIMARY KEY, location_id TEXT NOT NULL, period TEXT NOT NULL,
            total_sales REAL DEFAULT 0, total_expenses REAL DEFAULT 0,
            total_purchases REAL DEFAULT 0, net_result REAL DEFAULT 0,
            status TEXT DEFAULT 'draft', snapshot TEXT, created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            synced INTEGER DEFAULT 0,
            FOREIGN KEY (location_id) REFERENCES locations(id)
        );

        -- CONFIGURACIONES
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY, value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        -- REPORTES
        CREATE TABLE IF NOT EXISTS report_snapshots (
            id TEXT PRIMARY KEY, report_type TEXT NOT NULL, location_id TEXT,
            period TEXT, data TEXT NOT NULL,
            generated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE TABLE IF NOT EXISTS daily_summaries (
            id TEXT PRIMARY KEY, location_id TEXT NOT NULL, date TEXT NOT NULL,
            total_sales REAL DEFAULT 0, total_transactions INTEGER DEFAULT 0,
            total_items_sold INTEGER DEFAULT 0, top_products TEXT, cash_summary TEXT,
            payment_breakdown TEXT, avg_ticket REAL DEFAULT 0, computed_at TEXT,
            generated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        -- IA CACHÉ
        CREATE TABLE IF NOT EXISTS suggestion_cache (
            id TEXT PRIMARY KEY, type TEXT, sku TEXT, product_name TEXT,
            location_id TEXT, suggested_qty INTEGER, current_stock INTEGER,
            avg_daily_sales REAL, supplier_id TEXT, confidence REAL,
            reasoning TEXT, input_hash TEXT, result TEXT, model TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            expires_at TEXT
        );

        -- GESTIÓN DE RED
        CREATE TABLE IF NOT EXISTS network_status (
            location_id TEXT PRIMARY KEY, name TEXT,
            status TEXT DEFAULT 'unknown', last_seen TEXT,
            metrics TEXT, updated_at TEXT
        );

        -- BACKUP META
        CREATE TABLE IF NOT EXISTS backup_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL, size_bytes INTEGER,
            tables_included TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
    `);

    // Insert default sync_meta entries
    const tables = [
        'users', 'locations', 'warehouses', 'terminals',
        'products', 'inventory_batches', 'sales', 'sale_items',
        'cash_sessions', 'cash_movements', 'wms_movements',
        'clients', 'client_transactions', 'employees', 'attendance',
        'schedules', 'treasury_accounts', 'treasury_movements',
        'monthly_closings', 'app_settings', 'report_snapshots',
        'daily_summaries', 'suggestion_cache', 'network_status'
    ];

    for (const table of tables) {
        _db.run(
            'INSERT OR IGNORE INTO sync_meta (table_name, last_synced_at, row_count) VALUES (?, NULL, 0)',
            [table]
        );
    }

    log.info(`[OfflineDB] Schema initialized with ${tables.length} tables`);
}

// ─────────────────────────────────────────────────
// CRUD HELPERS (sql.js compatible)
// ─────────────────────────────────────────────────

/** Upsert a single row (INSERT OR REPLACE) */
function upsert(tableName, data) {
    if (!_db) return null;

    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => {
        const v = data[k];
        return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
    });

    _db.run(
        `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
        values
    );
    autoFlush();
    return data;
}

/** Upsert many rows */
function upsertMany(tableName, rows) {
    if (!_db || !rows.length) return;

    const keys = Object.keys(rows[0]);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;

    _db.run('BEGIN TRANSACTION');
    try {
        for (const row of rows) {
            const values = keys.map(k => {
                const v = row[k];
                return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
            });
            _db.run(sql, values);
        }
        _db.run('COMMIT');
    } catch (err) {
        _db.run('ROLLBACK');
        throw err;
    }

    autoFlush();
    log.info(`[OfflineDB] Upserted ${rows.length} rows into ${tableName}`);
}

/** Get all rows from a table with optional WHERE */
function getAll(tableName, where = {}, orderBy = null) {
    if (!_db) return [];

    const whereKeys = Object.keys(where);
    let sql = `SELECT * FROM ${tableName}`;

    if (whereKeys.length > 0) {
        const conditions = whereKeys.map(k => `${k} = ?`).join(' AND ');
        sql += ` WHERE ${conditions}`;
    }

    if (orderBy) {
        sql += ` ORDER BY ${orderBy}`;
    }

    const values = whereKeys.map(k => where[k]);
    const stmt = _db.prepare(sql);
    stmt.bind(values);

    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/** Get a single row by ID */
function getById(tableName, id) {
    if (!_db) return null;

    const stmt = _db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`);
    stmt.bind([id]);

    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

/** Delete a row by ID */
function deleteById(tableName, id) {
    if (!_db) return null;
    _db.run(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
    autoFlush();
    return { changes: _db.getRowsModified() };
}

/** Count rows with optional WHERE */
function count(tableName, where = {}) {
    if (!_db) return 0;

    const whereKeys = Object.keys(where);
    let sql = `SELECT COUNT(*) as count FROM ${tableName}`;

    if (whereKeys.length > 0) {
        const conditions = whereKeys.map(k => `${k} = ?`).join(' AND ');
        sql += ` WHERE ${conditions}`;
    }

    const values = whereKeys.map(k => where[k]);
    const stmt = _db.prepare(sql);
    stmt.bind(values);

    let result = 0;
    if (stmt.step()) {
        result = stmt.getAsObject().count || 0;
    }
    stmt.free();
    return result;
}

/** Run a raw SQL query (SELECT) */
function rawQuery(sql, params = []) {
    if (!_db) return [];
    const stmt = _db.prepare(sql);
    if (params.length) stmt.bind(params);

    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

/** Run a raw SQL exec (INSERT/UPDATE/DELETE) */
function rawExec(sql, params = []) {
    if (!_db) return null;
    _db.run(sql, params);
    autoFlush();
    return { changes: _db.getRowsModified() };
}

// ─────────────────────────────────────────────────
// SYNC QUEUE
// ─────────────────────────────────────────────────

function enqueueSync(tableName, operation, recordId, payload) {
    if (!_db) return;
    _db.run(
        `INSERT INTO sync_queue (table_name, operation, record_id, payload, created_at) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))`,
        [tableName, operation, recordId, JSON.stringify(payload)]
    );
    autoFlush();
}

function getPendingSyncItems(limit = 50) {
    return rawQuery(
        `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id ASC LIMIT ?`,
        [limit]
    );
}

function markSyncCompleted(id) {
    if (!_db) return;
    _db.run(`UPDATE sync_queue SET status = 'completed' WHERE id = ?`, [id]);
    autoFlush();
}

function markSyncFailed(id, error) {
    if (!_db) return;
    _db.run(
        `UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?`,
        [error, id]
    );
    autoFlush();
}

function retryFailedItems(maxRetries = 5) {
    if (!_db) return;
    _db.run(
        `UPDATE sync_queue SET status = 'pending' WHERE status = 'failed' AND retry_count < ?`,
        [maxRetries]
    );
    autoFlush();
}

function cleanCompletedSync(hoursOld = 24) {
    if (!_db) return;
    _db.run(
        `DELETE FROM sync_queue WHERE status = 'completed' AND created_at < datetime('now', 'localtime', '-${hoursOld} hours')`
    );
    autoFlush();
}

function updateSyncMeta(tableName) {
    if (!_db) return;
    const rowCount = count(tableName);
    _db.run(
        `UPDATE sync_meta SET last_synced_at = datetime('now', 'localtime'), row_count = ? WHERE table_name = ?`,
        [rowCount, tableName]
    );
    autoFlush();
}

function getSyncStatus() {
    return rawQuery('SELECT * FROM sync_meta ORDER BY table_name');
}

// ─────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────
module.exports = {
    initDB,
    getDB,
    closeDB,
    getDBPath,
    flushToDisk,
    // CRUD
    upsert,
    upsertMany,
    getAll,
    getById,
    deleteById,
    count,
    rawQuery,
    rawExec,
    // Sync Queue
    enqueueSync,
    getPendingSyncItems,
    markSyncCompleted,
    markSyncFailed,
    retryFailedItems,
    cleanCompletedSync,
    updateSyncMeta,
    getSyncStatus,
};
