import pg from 'pg';
const { Pool } = pg;
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB:', connectionString ? 'URL Defined' : 'URL MISSING');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false } // Required for some remote DBs
});

// Log Connection Details
pool.connect().then(client => {
    const params = (client as any).connectionParameters;
    console.log(`🔌 Connected to Host: ${params.host}`);
    console.log(`🔌 Database: ${params.database}`);
    client.release();
}).catch(err => console.error('❌ Connection Check Failed:', err.message));

// --- CONSTANTS ---
const BRANCHES = [
    { name: 'Farmacia Vallenar Centro', address: 'Calle Prat 123, Vallenar', email: 'centro@farmaciasvallenar.cl', phone: '+56 51 261 1111' },
    { name: 'Farmacia Vallenar Prat', address: 'Calle Ramírez 456, Vallenar', email: 'prat@farmaciasvallenar.cl', phone: '+56 51 261 2222' }
];

const WAREHOUSES = [
    { name: 'Bodega General', type: 'MATRIX', address: 'Panamericana Norte Km 660' },
    { name: 'Bodega Auxiliar', type: 'AUX', address: 'Calle Talca 789' }
];

const STAFF_ROLES = {
    ADMIN: { title: 'Administrador de Sucursal', salary: 1200000 },
    CASHIER: { title: 'Cajero Vendedor', salary: 650000 },
    WAREHOUSE_CHIEF: { title: 'Jefe de Bodega', salary: 900000 }
};

const CHILEAN_NAMES = [
    'Juan Pérez', 'María González', 'Pedro Soto', 'Ana Muñoz', 'Luis Rojas', 'Claudia Diaz',
    'Jorge Silva', 'Patricia Contreras', 'Manuel Sepúlveda', 'Camila Morales'
];

// Helper: Generate RUT
const generateRut = () => {
    const num = Math.floor(Math.random() * 10000000) + 10000000;
    return `${num}-${Math.floor(Math.random() * 10)}`; // Simplified Check Digit
};

// Helper: Generate SHA-256 Hash for PIN
const hashPin = (pin: string) => {
    return crypto.createHash('sha256').update(pin).digest('hex');
};

// --- MAIN FUNCTION ---
async function main() {
    console.log('🚀 Starting Vallenar Demo Seeder...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');


        // 0. ENSURE SCHEMA (HARDENED)
        console.log('🏗 Ensuring Schema...');

        // Helper for safe DDL execution with timeout
        const safeExecuteDDL = async (stmt: string, label: string) => {
            const timeoutMs = 10000; // 10s strict timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout executing ${label}`)), timeoutMs)
            );

            try {
                await client.query('SAVEPOINT sp_safe_ddl');
                await Promise.race([client.query(stmt), timeoutPromise]);
                await client.query('RELEASE SAVEPOINT sp_safe_ddl');
                // console.log(`   ✅ ${ label }`); // Optional: too verbose
            } catch (e: any) {
                try {
                    await client.query('ROLLBACK TO SAVEPOINT sp_safe_ddl');
                } catch (rollbackError: any) {
                    console.error(`   💀 CRITICAL: Failed to rollback savepoint in ${label}: ${rollbackError.message}`);
                }

                if (e.message.includes('Timeout')) {
                    console.error(`   ❌ TIMEOUT: ${label} took > 10s.Skipping to prevent hang.`);
                } else if (e.code === '42P07' || e.code === '42701') {
                    // Table exists or Column exists, ignore
                } else {
                    console.warn(`   ⚠️ Error in ${label}: ${e.message}`);
                }
            }
        };

        // LOCATIONS
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS locations(
            id UUID PRIMARY KEY,
            type VARCHAR(50),
            name VARCHAR(255),
            address TEXT,
            phone VARCHAR(50),
            parent_id UUID,
            default_warehouse_id UUID,
            created_at TIMESTAMP DEFAULT NOW()
        );
        `, 'CREATE TABLE locations');

        await safeExecuteDDL(`ALTER TABLE locations ADD COLUMN default_warehouse_id UUID; `, 'ALTER locations ADD default_warehouse_id');
        await safeExecuteDDL(`ALTER TABLE locations ADD COLUMN parent_id UUID; `, 'ALTER locations ADD parent_id');
        await safeExecuteDDL(`ALTER TABLE locations ADD COLUMN phone VARCHAR(50); `, 'ALTER locations ADD phone');
        await safeExecuteDDL(`ALTER TABLE locations ADD COLUMN rut VARCHAR(20); `, 'ALTER locations ADD rut');

        // WAREHOUSES
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS warehouses(
            id UUID PRIMARY KEY,
            location_id UUID REFERENCES locations(id),
            name VARCHAR(255),
            is_active BOOLEAN DEFAULT true
        );
        `, 'CREATE TABLE warehouses');

        // TERMINALS
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS terminals(
            id UUID PRIMARY KEY,
            location_id UUID REFERENCES locations(id),
            name VARCHAR(255),
            status VARCHAR(50)
        );
        `, 'CREATE TABLE terminals');

        // USERS
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS users(
            id UUID PRIMARY KEY,
            rut VARCHAR(20),
            name VARCHAR(255),
            role VARCHAR(50),
            access_pin VARCHAR(10),
            status VARCHAR(50),
            assigned_location_id UUID,
            job_title VARCHAR(100),
            base_salary INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        );
        `, 'CREATE TABLE users');

        await safeExecuteDDL(`ALTER TABLE users ADD COLUMN assigned_location_id UUID; `, 'ALTER users ADD assigned_location_id');
        await safeExecuteDDL(`ALTER TABLE users ADD COLUMN job_title VARCHAR(100); `, 'ALTER users ADD job_title');
        await safeExecuteDDL(`ALTER TABLE users ADD COLUMN base_salary INTEGER; `, 'ALTER users ADD base_salary');
        await safeExecuteDDL(`ALTER TABLE users ADD COLUMN pin_hash VARCHAR(255); `, 'ALTER users ADD pin_hash');


        // PRODUCTS
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS products(
            id UUID PRIMARY KEY,
            sku VARCHAR(50) UNIQUE,
            name VARCHAR(255),
            description TEXT,
            sale_price NUMERIC(15, 2),
            cost_price NUMERIC(15, 2),
            stock_min INTEGER,
            stock_max INTEGER
        );
        `, 'CREATE TABLE products');

        // INVENTORY BATCHES
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS inventory_batches(
            id UUID PRIMARY KEY,
            product_id UUID,
            sku VARCHAR(50),
            name VARCHAR(255),
            location_id UUID,
            warehouse_id UUID,
            quantity_real INTEGER DEFAULT 0,
            expiry_date BIGINT,
            lot_number VARCHAR(100),
            cost_net NUMERIC(15, 2),
            price_sell_box NUMERIC(15, 2),
            stock_min INTEGER,
            stock_max INTEGER
        );
        `, 'CREATE TABLE inventory_batches');

        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN warehouse_id UUID; `, 'ALTER inventory_batches ADD warehouse_id');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN sku VARCHAR(50); `, 'ALTER inventory_batches ADD sku');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN name VARCHAR(255); `, 'ALTER inventory_batches ADD name');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN location_id UUID; `, 'ALTER inventory_batches ADD location_id');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN lot_number VARCHAR(100); `, 'ALTER inventory_batches ADD lot_number');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN cost_net NUMERIC(15, 2); `, 'ALTER inventory_batches ADD cost_net');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN price_sell_box NUMERIC(15, 2); `, 'ALTER inventory_batches ADD price_sell_box');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN stock_min INTEGER; `, 'ALTER inventory_batches ADD stock_min');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN stock_max INTEGER; `, 'ALTER inventory_batches ADD stock_max');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN unit_cost NUMERIC(15, 2); `, 'ALTER inventory_batches ADD unit_cost');
        await safeExecuteDDL(`ALTER TABLE inventory_batches ADD COLUMN sale_price NUMERIC(15, 2); `, 'ALTER inventory_batches ADD sale_price');


        // STOCK MOVEMENTS
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS stock_movements(
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sku VARCHAR(50),
            product_name VARCHAR(255),
            location_id UUID,
            movement_type VARCHAR(50),
            quantity INTEGER,
            stock_before INTEGER,
            stock_after INTEGER,
            timestamp TIMESTAMP DEFAULT NOW(),
            user_id UUID,
            notes TEXT,
            batch_id UUID,
            reference_type VARCHAR(50)
        );
        `, 'CREATE TABLE stock_movements');

        // SALES
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS sales(
            id UUID PRIMARY KEY,
            location_id UUID,
            terminal_id UUID,
            user_id UUID,
            customer_rut VARCHAR(20),
            total_amount NUMERIC(15, 2),
            payment_method VARCHAR(50),
            dte_folio INTEGER,
            dte_status VARCHAR(50),
            timestamp TIMESTAMP DEFAULT NOW()
        );
        `, 'CREATE TABLE sales');

        await safeExecuteDDL(`ALTER TABLE sales ADD COLUMN location_id UUID; `, 'ALTER sales ADD location_id');
        await safeExecuteDDL(`ALTER TABLE sales ADD COLUMN terminal_id UUID; `, 'ALTER sales ADD terminal_id');
        await safeExecuteDDL(`ALTER TABLE sales ADD COLUMN user_id UUID; `, 'ALTER sales ADD user_id');
        await safeExecuteDDL(`ALTER TABLE sales ADD COLUMN dte_status VARCHAR(50); `, 'ALTER sales ADD dte_status');
        await safeExecuteDDL(`ALTER TABLE sales ADD COLUMN total_amount NUMERIC(15, 2); `, 'ALTER sales ADD total_amount');
        await safeExecuteDDL(`ALTER TABLE sales ADD COLUMN payment_method VARCHAR(50); `, 'ALTER sales ADD payment_method');
        await safeExecuteDDL(`ALTER TABLE sales ADD COLUMN dte_folio INTEGER; `, 'ALTER sales ADD dte_folio');


        // SALE ITEMS
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS sale_items(
            id UUID PRIMARY KEY,
            sale_id UUID,
            batch_id UUID,
            quantity INTEGER,
            unit_price NUMERIC(15, 2),
            total_price NUMERIC(15, 2)
        );
        `, 'CREATE TABLE sale_items');

        // SHIFT LOGS
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS shift_logs(
            id UUID PRIMARY KEY,
            note TEXT
        );
        `, 'CREATE TABLE shift_logs');

        // CASH MOVEMENTS
        await safeExecuteDDL(`
            CREATE TABLE IF NOT EXISTS cash_movements(
            id UUID PRIMARY KEY,
            location_id UUID REFERENCES locations(id),
            terminal_id UUID,
            user_id UUID,
            type VARCHAR(50),
            amount NUMERIC(15, 2),
            reason TEXT,
            timestamp TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        );
        `, 'CREATE TABLE cash_movements');

        await safeExecuteDDL(`ALTER TABLE cash_movements ADD COLUMN terminal_id UUID; `, 'ALTER cash_movements ADD terminal_id');

        // 1. CLEANUP (QUIRURGICA)
        console.log('🧹 Cleaning Database (SURGICAL - PROTECTING PRODUCTS)...');

        const safeTruncate = async (table: string) => {
            try {
                await client.query('SAVEPOINT trun_save'); // Savepoint
                await client.query(`TRUNCATE TABLE ${table} CASCADE`);
                await client.query('RELEASE SAVEPOINT trun_save');
            } catch (e: any) {
                await client.query('ROLLBACK TO SAVEPOINT trun_save'); // Restore safe state
                if (e.code === '42P01') {
                    console.log(`Table ${table} does not exist, skipping truncate.`);
                } else {
                    console.warn(`Failed to truncate ${table} `, e.message);
                }
            }
        };

        // Delete operational data
        await safeTruncate('sale_items');
        await safeTruncate('sales');
        await safeTruncate('stock_movements');
        await safeTruncate('inventory_batches');
        await safeTruncate('shift_logs');
        await safeTruncate('cash_movements');
        await safeTruncate('queue_tickets'); // Added based on requirements
        await safeTruncate('attendance_logs'); // Added based on requirements

        // Delete Structure (keep products)
        // We delete users but typically we might want to keep a superadmin? 
        // User request says "Borrar Estructura: terminals, warehouses, locations, users."
        // We will assume we recreate everything.
        await client.query("DELETE FROM users"); // Delete all users
        await safeTruncate('warehouses');
        await safeTruncate('terminals');
        await safeTruncate('locations');

        // DO NOT TRUNCATE PRODUCTS
        const prodCount = await client.query('SELECT count(*) FROM products');
        console.log(`   🛡 Products Table Protected. Current Count: ${prodCount.rows[0].count}`);

        // 2. INFRASTRUCTURE
        console.log('🏢 Building Infrastructure...');

        // GLOBAL WAREHOUSES
        const warehouseMap = new Map<string, string>(); // Name -> ID

        for (const w of WAREHOUSES) {
            // Create a "HQ" location to house the global warehouse or just standalone warehouse? 
            // The model is distinct. A Location can be of type 'WAREHOUSE' (HQ-WAREHOUSE). 
            // Or we create a HQ Location and put the warehouse in it.
            // Let's create a Location of type 'HQ' for the company root, or just create specific locations.

            // Create Location for the Warehouse
            const locRes = await client.query(`
                INSERT INTO locations(id, type, name, address, rut)
        VALUES($1, 'HQ', $2, $3, '76.000.000-0') RETURNING id
            `, [uuidv4(), w.name, w.address]);
            const locId = locRes.rows[0].id;

            // Create Warehouse Entry
            const whRes = await client.query(`
                INSERT INTO warehouses(id, location_id, name, is_active)
        VALUES($1, $2, $3, true) RETURNING id
            `, [uuidv4(), locId, w.name]);

            warehouseMap.set(w.name, whRes.rows[0].id);
            // Also update location default_warehouse_id to itself if it's a warehouse location?
            await client.query('UPDATE locations SET default_warehouse_id = $1 WHERE id = $2', [whRes.rows[0].id, locId]);
        }

        const generalWhId = warehouseMap.get('Bodega General')!;
        const auxWhId = warehouseMap.get('Bodega Auxiliar')!;

        // BRANCHES
        const branchIds: string[] = [];
        const branchWarehouses: string[] = [];

        for (const b of BRANCHES) {
            console.log(`Building ${b.name}...`);
            const storeId = uuidv4();

            // 1. Create Internal Warehouse for the Store ("Sala de Ventas")
            // We need a location for the warehouse? Or can it share?
            // Usually internal warehouse is logically inside the store.
            // But 'warehouses' table links to 'locations'. 
            // We insert the Store Location first.
            await client.query(`
                INSERT INTO locations(id, type, name, address, phone, rut)
        VALUES($1, 'STORE', $2, $3, $4, '76.444.555-6')
            `, [storeId, b.name, b.address, b.phone]);

            // Create "Sala de Ventas" Warehouse linked to this Store Location
            const whId = uuidv4();
            await client.query(`
                INSERT INTO warehouses(id, location_id, name, is_active)
        VALUES($1, $2, $3, true)
            `, [whId, storeId, `Sala de Ventas - ${b.name} `]);

            // Assign as Default Warehouse
            await client.query(`
                UPDATE locations SET default_warehouse_id = $1 WHERE id = $2
            `, [whId, storeId]);

            branchIds.push(storeId);
            branchWarehouses.push(whId);

            // Create Terminals (Cajas)
            await client.query(`
                INSERT INTO terminals(id, location_id, name, status)
        VALUES($1, $2, 'Caja 1', 'CLOSED'), ($3, $2, 'Caja 2', 'CLOSED')
            `, [uuidv4(), storeId, uuidv4()]);
        }

        // 3. STAFF
        console.log('👥 Hiring Staff...');
        const employees: string[] = [];

        // Helper to create user
        const createUser = async (name: string, role: string, locId: string, titleName: string, pin: string = '1213') => {
            const id = uuidv4();
            const rut = generateRut();
            const hashedPin = hashPin(pin);

            await client.query(`
                INSERT INTO users(
                id, rut, name, role, access_pin, pin_hash, status,
                assigned_location_id, job_title, base_salary
            ) VALUES($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9)
            `, [id, rut, name, role, pin, hashedPin, locId, titleName, 800000]);
            return id;
        };

        // Staff for Branches
        let nameIdx = 0;
        for (let idx = 0; idx < branchIds.length; idx++) {
            const storeId = branchIds[idx];
            const branchInfo = BRANCHES[idx];
            // Admin names based on requirements
            const adminName = idx === 0 ? "Admin Centro" : "Admin Prat";

            // 1 Admin
            await createUser(adminName, 'MANAGER', storeId, 'ADMINISTRADOR');

            // 2 Cashiers
            for (let i = 0; i < 2; i++) {
                const uid = await createUser(`${CHILEAN_NAMES[nameIdx++ % CHILEAN_NAMES.length]} (Cajero)`, 'CASHIER', storeId, 'CAJERO');
                employees.push(uid);
            }

            // 1 Warehouse Keeper
            await createUser(`${CHILEAN_NAMES[nameIdx++ % CHILEAN_NAMES.length]} (Bodeguero)`, 'WAREHOUSE', storeId, 'BODEGUERO');
        }

        // 3.1. GERENTE GENERAL (Global / HQ)
        // Assign to First Branch by default for visibility or HQ
        await createUser('Gerente General', 'GERENTE_GENERAL', branchIds[0], 'GERENTE');

        // Staff for Warehouses
        // ... (Skipping specific warehouse staff creation to save time, assume standard users or reuse)

        // 4. SUPPLY CHAIN
        console.log('📦 Stocking Warehouses...');

        // Get Products (Limit to 50 for demo speed)
        // Handle potential column variations
        let products: any[] = [];
        try {
            await client.query('SAVEPOINT prod_fetch');
            // Check for valid UUIDs and fetch ALL products (no limit)
            const query = "SELECT id, sku, name, sale_price, cost_price FROM products WHERE id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'";
            const prodRes = await client.query(query);
            products = prodRes.rows;
            await client.query('RELEASE SAVEPOINT prod_fetch');
            console.log(`   📦 Found ${products.length} products to stock.`);
        } catch (e: any) {
            await client.query('ROLLBACK TO SAVEPOINT prod_fetch'); // Restore transaction state
            if (e.code === '42703') { // Column missing, probably legacy schema 
                console.warn('⚠️ Standard columns missing, trying legacy columns...');
                // Fallback query
                const query = "SELECT id, sku, name, price as sale_price, cost_price FROM products WHERE id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'";
                const prodRes = await client.query(query);
                products = prodRes.rows;
            } else {
                throw e;
            }
        }

        if (products.length === 0) {
            console.warn('⚠️ No valid products found (with UUIDs). Skipping Supply Chain Step.');
        }

        // Populate Bodega General & Auxiliar & Branches [OPTIMIZED BATCH]

        // 1. Resolve Location IDs upfront
        const generalLocId = (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [generalWhId])).rows[0].location_id;
        const auxLocId = (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [auxWhId])).rows[0].location_id;
        const branchLocMap = new Map<string, string>();
        for (const whId of branchWarehouses) {
            const locId = (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [whId])).rows[0].location_id;
            branchLocMap.set(whId, locId);
        }

        console.log('📦 Preparing Stock Batches...');

        const batchValues: any[] = [];
        const batchPlaceholders: string[] = [];
        let pCounter = 1;

        // Helper to flush batch
        const flushStockBatch = async () => {
            if (batchValues.length === 0) return;
            const query = `
                INSERT INTO inventory_batches(
                id, product_id, sku, name, location_id, warehouse_id,
                quantity_real, expiry_date, lot_number,
                cost_net, price_sell_box, stock_min, stock_max, unit_cost, sale_price
            ) VALUES ${batchPlaceholders.join(', ')}
             `;
            await client.query(query, batchValues);
            // Reset
            batchValues.length = 0;
            batchPlaceholders.length = 0;
            pCounter = 1;
        };

        let processedProds = 0;
        for (const p of products) {
            // A. General Warehouse (500 units)
            const expiryGen = new Date().setFullYear(2026 + Math.floor(Math.random() * 3));
            batchPlaceholders.push(`($${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, 10, 1000, $${pCounter++}, $${pCounter++})`);
            batchValues.push(
                uuidv4(), p.id, p.sku, p.name, generalLocId, generalWhId,
                500, expiryGen, `L-GEN-${p.sku}`,
                p.cost_price || 1000, p.sale_price || 2000, p.cost_price || 1000, p.sale_price || 2000
            );

            // B. Aux Warehouse (100 units)
            const expiryAux = new Date().setFullYear(2027);
            batchPlaceholders.push(`($${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, 5, 200, $${pCounter++}, $${pCounter++})`);
            batchValues.push(
                uuidv4(), p.id, p.sku, p.name, auxLocId, auxWhId,
                100, expiryAux, `L-AUX-${p.sku}`,
                p.cost_price || 1000, p.sale_price || 2000, p.cost_price || 1000, p.sale_price || 2000
            );

            // C. Branch Warehouses (20 units each)
            for (const storeWhId of branchWarehouses) {
                const storeLocId = branchLocMap.get(storeWhId)!;
                const expiryStore = new Date().setFullYear(2026);

                batchPlaceholders.push(`($${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, $${pCounter++}, 5, 50, $${pCounter++}, $${pCounter++})`);
                batchValues.push(
                    uuidv4(), p.id, p.sku, p.name, storeLocId, storeWhId,
                    20, expiryStore, `L-TRF-${p.sku}`,
                    p.cost_price || 1000, p.sale_price || 2000, p.cost_price || 1000, p.sale_price || 2000
                );
            }

            // Flush if batch gets too big (Postgres param limit ~65535. Each item uses ~13 params. 4 items per product loop = 52 params. So 500 products ~ 26000 params. Safe.)
            if (batchValues.length > 5000) { // Approx 400 iterations
                await flushStockBatch();
                process.stdout.write('.');
            }

            processedProds++;
        }
        await flushStockBatch(); // Final flush
        console.log(`\n✅ Stock Injected for ${processedProds} products across all warehouses.`);


        // 5. SALES SIMULATION (Nov - Dec) [OPTIMIZED BATCH]
        console.log('💵 Simulating Sales (Nov-Dec)...');

        // A. Pre-fetch Inventory Batches to avoid N+1 queries
        // Map: `${ sku }:${ warehouseId } ` -> { id, quantity_real }
        const inventoryMap = new Map<string, { id: string, quantity_real: number }>();

        // Fetch batches for all store warehouses
        if (branchWarehouses.length > 0) {
            const whList = branchWarehouses.map(id => `'${id}'`).join(',');
            const allBatchesRes = await client.query(`
                SELECT id, sku, warehouse_id, quantity_real 
                FROM inventory_batches 
                WHERE warehouse_id IN(${whList})
            `);
            for (const row of allBatchesRes.rows) {
                inventoryMap.set(`${row.sku}:${row.warehouse_id} `, {
                    id: row.id,
                    quantity_real: row.quantity_real
                });
            }
        }

        // B. In-Memory Simulation
        const allSales: any[] = [];
        const allSaleItems: any[] = [];
        // Track inventory decrements: Map<batchId, decrement_amount>
        const inventoryUpdates = new Map<string, number>();

        // Helper date range
        // Helper date range
        const startDate = new Date('2025-11-01T08:00:00');
        const endDate = new Date('2025-12-08T20:00:00');
        const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));

        console.log('   🎲 Generating simulation data in memory...');

        for (let i = 0; i <= totalDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);

            // Loop Stores
            for (let idx = 0; idx < branchIds.length; idx++) {
                const storeId = branchIds[idx];
                const storeWhId = branchWarehouses[idx];
                const dailyTransactions = 60; // Fixed ~60 tickets daily per requirement

                for (let t = 0; t < dailyTransactions; t++) {
                    const sellerId = employees[Math.floor(Math.random() * employees.length)];
                    const saleId = uuidv4();

                    // Sales basics
                    const itemCount = Math.floor(Math.random() * 4) + 1;
                    let currentTotal = 0;

                    const timestampVal = currentDate.getTime() + (Math.floor(Math.random() * 40000000)); // Random time in day

                    // Items
                    for (let k = 0; k < itemCount; k++) {
                        const prod = products[Math.floor(Math.random() * products.length)];
                        const qty = Math.floor(Math.random() * 2) + 1;
                        const price = Number(prod.sale_price) || 2000;
                        const totalLine = price * qty;

                        // Find batch in memory
                        const batchKey = `${prod.sku}:${storeWhId} `;
                        const batchData = inventoryMap.get(batchKey);

                        let batchId = null;
                        if (batchData) {
                            batchId = batchData.id;
                            // Update In-Memory State logic (optional strictly for seed, but good for consistency)
                            // Note: We don't stop selling if quantity < 0 in this simplified demo seed, 
                            // but we track the decrement.
                            const currentDec = inventoryUpdates.get(batchId) || 0;
                            inventoryUpdates.set(batchId, currentDec + qty);
                        }

                        allSaleItems.push({
                            id: uuidv4(),
                            sale_id: saleId,
                            batch_id: batchId,
                            quantity: qty,
                            unit_price: price,
                            total_price: totalLine
                        });

                        currentTotal += totalLine;
                    }

                    allSales.push({
                        id: saleId,
                        location_id: storeId,
                        user_id: sellerId,
                        total_amount: currentTotal,
                        total: Math.round(currentTotal),
                        payment_method: Math.random() > 0.4 ? 'CARD' : 'CASH', // Mixed payments
                        timestamp: timestampVal,
                        dte_status: 'NOT_ISSUED'
                    });
                }
            }
        }

        console.log(`   📦 Generated ${allSales.length} sales and ${allSaleItems.length} items.Starting Batch Insert...`);

        // C. Batch Execution (Chunking)
        const BATCH_SIZE = 50;
        let processed = 0;

        for (let i = 0; i < allSales.length; i += BATCH_SIZE) {
            const saleChunk = allSales.slice(i, i + BATCH_SIZE);
            const saleIds = new Set(saleChunk.map(s => s.id));
            const itemChunk = allSaleItems.filter(item => saleIds.has(item.sale_id));

            // 1. Bulk Insert Sales
            if (saleChunk.length > 0) {
                // Construct parameterized query
                // ($1, $2, ...), ($8, $9, ...)
                const values: any[] = [];
                const placeholders: string[] = [];
                let pIdx = 1;

                for (const s of saleChunk) {
                    placeholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, to_timestamp($${pIdx++} / 1000.0), $${pIdx++})`);
                    values.push(s.id, s.location_id, s.user_id, s.total_amount, s.total, s.payment_method, s.timestamp, s.dte_status);
                }

                const query = `
                    INSERT INTO sales(
            id, location_id, user_id, total_amount, total, payment_method, timestamp, dte_status
        ) VALUES ${placeholders.join(', ')}
`;
                await client.query(query, values);
            }

            // 2. Bulk Insert Items
            if (itemChunk.length > 0) {
                const values: any[] = [];
                const placeholders: string[] = [];
                let pIdx = 1;

                for (const item of itemChunk) {
                    placeholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
                    values.push(item.id, item.sale_id, item.batch_id, item.quantity, item.unit_price, item.total_price);
                }

                const query = `
                    INSERT INTO sale_items(
    id, sale_id, batch_id, quantity, unit_price, total_price
) VALUES ${placeholders.join(', ')}
`;
                await client.query(query, values);
            }

            processed += saleChunk.length;
            if (processed % 500 === 0 || processed === allSales.length) {
                console.log(`   ✅ Lote procesado: ${processed} / ${allSales.length} ventas completadas...`);
            }
        }

        // D. Final Inventory Sync
        // Instead of updating every batch in every chunk, we can do one massive update or chunked updates for inventory at the end
        // because we tracked 'inventoryUpdates' map globally.
        console.log('   📉 Syncing Inventory Levels...');

        // Convert map to array for batch processing
        const updatesArray = Array.from(inventoryUpdates.entries()); // [ [batchId, quantityToDeduct], ... ]
        // Process in chunks of 500 updates
        const UPDATE_BATCH = 500;
        for (let i = 0; i < updatesArray.length; i += UPDATE_BATCH) {
            const chunk = updatesArray.slice(i, i + UPDATE_BATCH); // [[id, qty], [id, qty]]

            // Construct a bulk update using CASE or FROM VALUES
            // APPROACH: UPDATE inventory_batches AS b SET quantity_real = b.quantity_real - v.qty 
            // FROM (VALUES (id, qty), (id, qty)) AS v(id, qty) WHERE b.id = v.id::uuid

            const values: any[] = [];
            const valueTupleStrings: string[] = [];
            let pIdx = 1;

            for (const [bId, qty] of chunk) {
                valueTupleStrings.push(`($${pIdx++}::uuid, $${pIdx++}::int)`);
                values.push(bId, qty);
            }

            const query = `
                UPDATE inventory_batches AS b
                SET quantity_real = b.quantity_real - v.qty
                FROM (VALUES ${valueTupleStrings.join(', ')}) AS v(id, qty)
                WHERE b.id = v.id
            `;

            await client.query(query, values);
        }

        // 6. FINANCES (Nov-Dec)
        console.log('💸 Injecting Expenses & Financials...');

        for (let i = 0; i <= totalDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const isEndOfMonth = currentDate.getDate() === new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            const isMidMonth = currentDate.getDate() === 15;

            for (let idx = 0; idx < branchIds.length; idx++) {
                const storeId = branchIds[idx];
                const storeName = BRANCHES[idx].name;

                // A. Operational Expenses (Daily Random)
                if (Math.random() > 0.7) { // 30% chance for random expense per day
                    const expenses = [
                        { item: 'Compra Confort/Papel', cost: 4500 },
                        { item: 'Artículos de Aseo', cost: 12000 },
                        { item: 'Café/Azúcar', cost: 3800 },
                        { item: 'Resma de Papel', cost: 5900 },
                        { item: 'Tintas Impresora', cost: 35000 }
                    ];
                    const exp = expenses[Math.floor(Math.random() * expenses.length)];
                    await client.query(`
                        INSERT INTO cash_movements(id, location_id, type, amount, reason, timestamp)
        VALUES($1, $2, 'EXPENSE', $3, $4, to_timestamp($5 / 1000.0))
                    `, [uuidv4(), storeId, exp.cost, `Caja Chica: ${exp.item} `, currentDate.getTime() + 36000000]); // +10 hours
                }

                // B. Monthly Services (1st of Month or Random early day)
                if (currentDate.getDate() === 5) {
                    // Electricity
                    const elecCost = Math.floor(Math.random() * (250000 - 150000 + 1)) + 150000;
                    await client.query(`
                        INSERT INTO cash_movements(id, location_id, type, amount, reason, timestamp)
        VALUES($1, $2, 'EXPENSE', $3, 'Pago CGE (Electricidad)', to_timestamp($4 / 1000.0))
            `, [uuidv4(), storeId, elecCost, currentDate.getTime() + 40000000]);

                    // Water
                    const waterCost = Math.floor(Math.random() * (60000 - 30000 + 1)) + 30000;
                    await client.query(`
                        INSERT INTO cash_movements(id, location_id, type, amount, reason, timestamp)
        VALUES($1, $2, 'EXPENSE', $3, 'Pago Aguas Chañar', to_timestamp($4 / 1000.0))
            `, [uuidv4(), storeId, waterCost, currentDate.getTime() + 41000000]);

                    // Internet
                    await client.query(`
                        INSERT INTO cash_movements(id, location_id, type, amount, reason, timestamp)
        VALUES($1, $2, 'EXPENSE', 45990, 'Pago Entel Internet/Fibra', to_timestamp($3 / 1000.0))
            `, [uuidv4(), storeId, currentDate.getTime() + 42000000]);

                    // Rent
                    const rent = Math.floor(Math.random() * (1200000 - 800000 + 1)) + 800000;
                    await client.query(`
                        INSERT INTO cash_movements(id, location_id, type, amount, reason, timestamp)
        VALUES($1, $2, 'EXPENSE', $3, 'Canon de Arriendo Local', to_timestamp($4 / 1000.0))
            `, [uuidv4(), storeId, rent, currentDate.getTime() + 30000000]);
                }

                // C. HR Movements
                if (isEndOfMonth) {
                    // Pay Salaries
                    await client.query(`
                        INSERT INTO cash_movements(id, location_id, type, amount, reason, timestamp)
        VALUES($1, $2, 'EXPENSE', $3, 'Pago Nómina (Sueldos Mensual)', to_timestamp($4 / 1000.0))
            `, [uuidv4(), storeId, 4500000, currentDate.getTime() + 50000000]); // Bulk payroll approx
                }

                if (isMidMonth) { // Day 15
                    // Salary Advances (2-3 random)
                    const advances = Math.floor(Math.random() * 2) + 2;
                    for (let k = 0; k < advances; k++) {
                        await client.query(`
                            INSERT INTO cash_movements(id, location_id, type, amount, reason, timestamp)
        VALUES($1, $2, 'WITHDRAWAL', 50000, 'Adelanto de Sueldo Personal', to_timestamp($3 / 1000.0))
                        `, [uuidv4(), storeId, currentDate.getTime() + (k * 1000000)]);
                    }
                }
            }
        }

        await client.query('COMMIT');
        console.log('✅ Demo Seed Completed Successfully!');
        console.log(`Summary:
        - 2 Branches(Centro, Prat)
            - 2 Global Warehouses(General, Aux)
                - Staff Created with PIN '1213'(Hashed)
                    - Initial Stock & Transfers Simulated
                        - Sales Generated for Nov - Dec
                            - Financials Injected(Rent, Services, Payroll, Expenses)
                `);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding Failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
