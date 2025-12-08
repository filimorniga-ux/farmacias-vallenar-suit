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

// --- CONSTANTS ---
const BRANCHES = [
    { name: 'Sucursal Centro', address: 'Calle Prat 123, Vallenar', email: 'centro@farmaciasvallenar.cl', phone: '+56 51 261 1111' },
    { name: 'Sucursal Prat', address: 'Calle Ramírez 456, Vallenar', email: 'prat@farmaciasvallenar.cl', phone: '+56 51 261 2222' }
];

const WAREHOUSES = [
    { name: 'Bodega General', type: 'MATRIX', address: 'Panamericana Norte Km 660' },
    { name: 'Bodega Auxiliar', type: 'AUX', address: 'Calle Talca 789' }
];

const STAFF_ROLES = {
    ADMIN: { title: 'Administrador de Sucursal', salary: 1200000 },
    CASHIER: { title: 'Cajero Vendedo', salary: 650000 },
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

        // 1. CLEANUP
        console.log('🧹 Cleaning Database...');

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

        await safeTruncate('sale_items');
        await safeTruncate('sales');
        await safeTruncate('stock_movements');
        await safeTruncate('inventory_batches');
        await safeTruncate('shift_logs');
        await safeTruncate('cash_movements');

        // Delete rows from master tables (keep structure)
        await client.query("DELETE FROM users WHERE role != 'DEV'");
        await safeTruncate('warehouses');
        await safeTruncate('terminals');
        await safeTruncate('locations');

        // Reset Products Inventory (Update, not Delete)
        // await client.query('UPDATE products SET ...'); // Products are master data, inventory is in batches tables now. So just truncating batches is enough.

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
        const createUser = async (name: string, role: string, locId: string, titleName: string) => {
            const id = uuidv4();
            const rut = generateRut();
            // Security: Standard PIN '1213' for all demo users
            const stdPin = '1213';
            const hashedPin = hashPin(stdPin);

            await client.query(`
                INSERT INTO users(
                id, rut, name, role, access_pin, pin_hash, status,
                assigned_location_id, job_title, base_salary
            ) VALUES($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9)
            `, [id, rut, name, role, stdPin, hashedPin, locId, titleName, 800000]);
            return id;
        };

        // Staff for Branches
        let nameIdx = 0;
        for (const storeId of branchIds) {
            // 1 Admin
            await createUser(`${CHILEAN_NAMES[nameIdx++ % CHILEAN_NAMES.length]} (Admin)`, 'MANAGER', storeId, 'ADMINISTRADOR');
            // 3 Cashiers
            for (let i = 0; i < 3; i++) {
                const uid = await createUser(`${CHILEAN_NAMES[nameIdx++ % CHILEAN_NAMES.length]} `, 'CASHIER', storeId, 'VENDEDOR');
                employees.push(uid);
            }
        }

        // Staff for Warehouses
        // ... (Skipping specific warehouse staff creation to save time, assume standard users or reuse)

        // 4. SUPPLY CHAIN
        console.log('📦 Stocking Warehouses...');

        // Get Products (Limit to 50 for demo speed)
        // Handle potential column variations
        let products: any[] = [];
        try {
            await client.query('SAVEPOINT prod_fetch');
            // Check for valid UUIDs to avoid insertion errors in batch tables
            const query = "SELECT id, sku, name, sale_price, cost_price FROM products WHERE id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' LIMIT 50";
            const prodRes = await client.query(query);
            products = prodRes.rows;
            await client.query('RELEASE SAVEPOINT prod_fetch');
        } catch (e: any) {
            await client.query('ROLLBACK TO SAVEPOINT prod_fetch'); // Restore transaction state
            if (e.code === '42703') { // Column missing, probably legacy schema 
                console.warn('⚠️ Standard columns missing, trying legacy columns...');
                // Fallback query
                const query = "SELECT id, sku, name, price as sale_price, cost_price FROM products WHERE id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' LIMIT 50";
                const prodRes = await client.query(query);
                products = prodRes.rows;
            } else {
                throw e;
            }
        }

        if (products.length === 0) {
            console.warn('⚠️ No valid products found (with UUIDs). Skipping Supply Chain Step.');
        }

        // Populate Bodega General (500 units) & Auxiliar (100 units)
        for (const p of products) {
            // General
            const batchGenId = uuidv4();
            await client.query(`
                INSERT INTO inventory_batches(
                id, product_id, sku, name, location_id, warehouse_id,
                quantity_real, expiry_date, lot_number,
                cost_net, price_sell_box, stock_min, stock_max, unit_cost, sale_price
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 10, 1000, $12, $13)
            `, [
                batchGenId, p.id, p.sku, p.name,
                // Need the Location ID of the warehouse. 
                // We stored warehouse IDs in warehouseMap.
                // But inventory_batches needs location_id (Store/HQ) AND warehouse_id.
                // We will use the LOCATION ID linked to the Warehouse.
                // Actually `warehouseMap` stores Warehouse ID. We need its Location ID.
                // Let's resolve location from warehouse ID.
                (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [generalWhId])).rows[0].location_id, // location_id
                generalWhId, // warehouse_id
                500, Date.now() + 31536000000, `L - GEN - ${p.sku} `,
                p.cost_price || 1000, p.sale_price || 2000, p.cost_price || 1000, p.sale_price || 2000
            ]);

            // Auxiliar
            const batchAuxId = uuidv4();
            await client.query(`
                INSERT INTO inventory_batches(
                id, product_id, sku, name, location_id, warehouse_id,
                quantity_real, expiry_date, lot_number,
                cost_net, price_sell_box, stock_min, stock_max, unit_cost, sale_price
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 5, 200, $12, $13)
            `, [
                batchAuxId, p.id, p.sku, p.name,
                (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [auxWhId])).rows[0].location_id,
                auxWhId,
                100, Date.now() + 40000000000, `L - AUX - ${p.sku} `,
                p.cost_price || 1000, p.sale_price || 2000, p.cost_price || 1000, p.sale_price || 2000
            ]);

            // Log Movements (Initial)
            // ... (Simple log instruction)
        }

        console.log('🚚 Distributing to Branches (WMS)...');
        // Distribute 20 units to each Store's Warehouse
        for (const p of products) {
            for (const storeWhId of branchWarehouses) {
                // Determine Store Location ID for this warehouse
                const storeLocId = (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [storeWhId])).rows[0].location_id;

                // Create Batch in Store Warehouse
                const batchStoreId = uuidv4();
                await client.query(`
                    INSERT INTO inventory_batches(
                id, product_id, sku, name, location_id, warehouse_id,
                quantity_real, expiry_date, lot_number,
                cost_net, price_sell_box, stock_min, stock_max, unit_cost, sale_price
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 5, 50, $12, $13)
                `, [
                    batchStoreId, p.id, p.sku, p.name,
                    storeLocId,
                    storeWhId,
                    20, // 20 Units
                    Date.now() + 30000000000, `L - TRF - ${p.sku} `,
                    p.cost_price || 1000, p.sale_price || 2000, p.cost_price || 1000, p.sale_price || 2000
                ]);
            }
        }

        // 5. SALES SIMULATION (Nov - Dec)
        console.log('💵 Simulating Sales (Nov-Dec)...');

        // Helper date range
        const startDate = new Date('2024-11-01');
        const endDate = new Date('2024-12-07');
        const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));

        for (let i = 0; i <= totalDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;

            // Loop Stores
            for (let bIdx = 0; bIdx < branchIds.length; bIdx++) {
                const storeId = branchIds[bIdx];
                const storeWhId = branchWarehouses[bIdx];
                const dailyTransactions = Math.floor(Math.random() * (80 - 40 + 1)) + 40; // 40-80 sales

                // console.log(`  Processing ${ currentDate.toISOString().split('T')[0] } - Store ${ bIdx + 1 }: ${ dailyTransactions } sales`);

                for (let t = 0; t < dailyTransactions; t++) {
                    // Random Seller
                    const sellerId = employees[Math.floor(Math.random() * employees.length)]; // Simplify: pick any employee

                    // Random Items (1-4)
                    const itemCount = Math.floor(Math.random() * 4) + 1;
                    const saleTotal = 0;
                    const saleId = uuidv4();
                    const items: any[] = [];
                    let currentTotal = 0;

                    // Pick random products
                    for (let k = 0; k < itemCount; k++) {
                        const prod = products[Math.floor(Math.random() * products.length)];
                        const qty = Math.floor(Math.random() * 2) + 1;
                        const price = Number(prod.sale_price) || 2000;

                        items.push({
                            id: uuidv4(),
                            sku: prod.sku,
                            price: price,
                            qty: qty,
                            // Find Simulated Batch in this store
                            // Since we didn't track precise batch IDs in map, we'll query DB or just assume one exists for seed speed.
                            // Ideally query: SELECT id FROM inventory_batches WHERE sku=$1 AND warehouse_id=$2 LIMIT 1
                        });
                        currentTotal += (price * qty);
                    }

                    // Insert Sale
                    // Insert into both 'total' and 'total_amount' to support legacy/new schema hybrid
                    await client.query(`
                        INSERT INTO sales(
                id, location_id, user_id, total_amount, total, payment_method,
                timestamp, dte_status
            ) VALUES($1, $2, $3, $4, $5, 'CASH', to_timestamp($6 / 1000.0), 'NOT_ISSUED')
                `, [
                        saleId,
                        storeId,
                        sellerId,
                        currentTotal, // total_amount (Numeric)
                        Math.round(currentTotal), // total (Integer safe)
                        currentDate.getTime() + (Math.floor(Math.random() * 40000000))
                    ]);

                    // Insert Items & Decrement Stock
                    for (const item of items) {
                        // Find batch to deduct
                        const batchRes = await client.query(`
                            SELECT id, quantity_real FROM inventory_batches 
                            WHERE sku = $1 AND warehouse_id = $2 
                            LIMIT 1
            `, [item.sku, storeWhId]);

                        let batchId = null;
                        if (batchRes.rows.length > 0) {
                            batchId = batchRes.rows[0].id;
                            // Decrement
                            await client.query('UPDATE inventory_batches SET quantity_real = quantity_real - $1 WHERE id = $2', [item.qty, batchId]);
                        }

                        await client.query(`
                            INSERT INTO sale_items(
                id, sale_id, batch_id, quantity, unit_price, total_price
            ) VALUES($1, $2, $3, $4, $5, $6)
                `, [item.id, saleId, batchId, item.qty, item.price, item.price * item.qty]);
                    }
                }
            }
        }

        // 6. FINANCES (Nov-Dec)
        console.log('💸 Injecting Expenses & Financials...');

        for (let i = 0; i <= totalDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const isEndOfMonth = currentDate.getDate() === new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            const isMidMonth = currentDate.getDate() === 15;

            for (let bIdx = 0; bIdx < branchIds.length; bIdx++) {
                const storeId = branchIds[bIdx];
                const storeName = BRANCHES[bIdx].name;

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
