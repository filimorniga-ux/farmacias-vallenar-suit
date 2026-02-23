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
const connectionString = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB:', connectionString ? connectionString.replace(/:[^:@]+@/, ':****@') : 'URL MISSING');

const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// --- CONSTANTS ---
const BRANCHES = [
    { name: 'Farmacia Centro', address: 'Calle Prat 123, Vallenar', email: 'centro@farmaciasvallenar.cl', phone: '+56 51 261 1111' },
    { name: 'Farmacia Prat', address: 'Calle Ramírez 456, Vallenar', email: 'prat@farmaciasvallenar.cl', phone: '+56 51 261 2222' }
];

const WAREHOUSES = [
    { name: 'Bodega General', type: 'MATRIX', address: 'Panamericana Norte Km 660' },
    { name: 'Bodega Auxiliar', type: 'AUX', address: 'Calle Talca 789' }
];

const BATCH_SIZE = 50;

// Data Generators
const CHILEAN_NAMES = [
    'Juan Pérez', 'María González', 'Pedro Soto', 'Ana Muñoz', 'Luis Rojas', 'Claudia Diaz',
    'Jorge Silva', 'Patricia Contreras', 'Manuel Sepúlveda', 'Camila Morales', 'Diego Castro',
    'Valentina Vargas', 'Felipe Herrera', 'Daniela Castillo', 'Javiera Rojas'
];

const AFPS = ['Modelo', 'Habitat', 'Cuprum', 'Capital', 'PlanVital', 'Provida'];
const HEALTH_SYSTEMS = ['Fonasa A', 'Fonasa B', 'Fonasa C', 'Fonasa D', 'Isapre Colmena', 'Isapre Cruz Blanca', 'Isapre Banmedica'];

const generateRut = () => {
    const num = Math.floor(Math.random() * 10000000) + 10000000;
    return `${num}-${Math.floor(Math.random() * 10)}`;
};

const hashPin = (pin: string) => {
    return crypto.createHash('sha256').update(pin).digest('hex');
};

const getRandomElement = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

// --- MAIN FUNCTION ---
async function main() {
    console.log('🚀 Starting High-Fidelity Vallenar Demo Seeder (Batch Optimized)...');
    const client = await pool.connect();

    try {
        // 0. RESET SCHEMA (Clean start for tests)
        console.log('🗑 Resetting Schema...');
        const tablesToDrop = ['stock_movements', 'invoice_parsings', 'sale_items', 'sales', 'inventory_batches', 'cash_movements', 'terminals', 'warehouses', 'users', 'locations', 'customers', 'products'];
        for (const t of tablesToDrop) {
            try { await client.query(`DROP TABLE IF EXISTS ${t} CASCADE`); } catch (e) { }
        }

        // 1. ENSURE SCHEMA (Outside Transaction to avoid aborts on optional errors)
        console.log('🏗 Ensuring Schema & Adding Columns...');
        const ddlStatements = [
            `CREATE TABLE IF NOT EXISTS locations(id UUID PRIMARY KEY, type VARCHAR(50), name VARCHAR(255), address TEXT, phone VARCHAR(50), parent_id UUID, default_warehouse_id UUID, rut VARCHAR(20), is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW())`,
            `CREATE TABLE IF NOT EXISTS warehouses(id UUID PRIMARY KEY, location_id UUID REFERENCES locations(id), name VARCHAR(255), is_active BOOLEAN DEFAULT true)`,
            `CREATE TABLE IF NOT EXISTS terminals(id UUID PRIMARY KEY, location_id UUID REFERENCES locations(id), name VARCHAR(255), status VARCHAR(50))`,
            `CREATE TABLE IF NOT EXISTS users(id UUID PRIMARY KEY, rut VARCHAR(20), name VARCHAR(255), role VARCHAR(50), access_pin VARCHAR(10), pin_hash VARCHAR(255), status VARCHAR(50), assigned_location_id UUID, job_title VARCHAR(100), base_salary INTEGER, afp VARCHAR(50), health_system VARCHAR(100), created_at TIMESTAMP DEFAULT NOW())`,
            `CREATE TABLE IF NOT EXISTS products(id UUID PRIMARY KEY, sku VARCHAR(50) UNIQUE, name VARCHAR(255), description TEXT, sale_price NUMERIC(15, 2), price NUMERIC(15, 2), cost_price NUMERIC(15, 2), stock_min INTEGER, stock_max INTEGER, stock_actual INTEGER DEFAULT 0)`,
            `CREATE TABLE IF NOT EXISTS inventory_batches(id UUID PRIMARY KEY, product_id UUID, sku VARCHAR(50), name VARCHAR(255), location_id UUID, warehouse_id UUID, quantity_real INTEGER DEFAULT 0, expiry_date TIMESTAMP, lot_number VARCHAR(100), cost_net NUMERIC(15, 2), price_sell_box NUMERIC(15, 2), stock_min INTEGER, stock_max INTEGER, unit_cost NUMERIC(15, 2), sale_price NUMERIC(15, 2), updated_at TIMESTAMP DEFAULT NOW(), source_system VARCHAR(50))`,
            `CREATE TABLE IF NOT EXISTS sales(id UUID PRIMARY KEY, location_id UUID, terminal_id UUID, user_id UUID, customer_rut VARCHAR(20), total_amount NUMERIC(15, 2), total NUMERIC(15, 2), payment_method VARCHAR(50), dte_folio INTEGER, dte_status VARCHAR(50), timestamp TIMESTAMP DEFAULT NOW())`,
            `CREATE TABLE IF NOT EXISTS sale_items(id UUID PRIMARY KEY, sale_id UUID, batch_id UUID, quantity INTEGER, unit_price NUMERIC(15, 2), total_price NUMERIC(15, 2))`,
            `CREATE TABLE IF NOT EXISTS cash_movements(id UUID PRIMARY KEY, location_id UUID, terminal_id UUID, user_id UUID, type VARCHAR(50), amount NUMERIC(15, 2), reason TEXT, timestamp TIMESTAMP DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW())`,
            `CREATE TABLE IF NOT EXISTS customers(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rut VARCHAR(20), name VARCHAR(255), email VARCHAR(255), phone VARCHAR(50), address TEXT, source VARCHAR(50), created_at TIMESTAMP DEFAULT NOW())`,
            `CREATE TABLE IF NOT EXISTS invoice_parsings(id UUID PRIMARY KEY, status VARCHAR(50), original_file_name VARCHAR(255), parsed_items JSONB, mapped_items INTEGER, unmapped_items INTEGER, created_by UUID, invoice_number VARCHAR(50), document_type VARCHAR(50), original_file_type VARCHAR(50), created_at TIMESTAMP DEFAULT NOW())`,
            `CREATE TABLE IF NOT EXISTS stock_movements(id UUID PRIMARY KEY, sku VARCHAR(50), product_name VARCHAR(255), location_id UUID, movement_type VARCHAR(50), quantity INTEGER, stock_before INTEGER, stock_after INTEGER, timestamp TIMESTAMP DEFAULT NOW(), user_id UUID, notes TEXT, batch_id UUID, reference_type VARCHAR(50), reference_id UUID)`
        ];

        for (const stmt of ddlStatements) {
            try {
                await client.query(stmt);
            } catch (e: any) {
                // Ignore "already exists" errors aggressively
            }
        }

        // Add missing columns safely
        const alterStatements = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS afp VARCHAR(50)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS health_system VARCHAR(100)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary INTEGER",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50)",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(15, 2)",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(15, 2)"
        ];
        for (const stmt of alterStatements) {
            try { await client.query(stmt); } catch (e) { }
        }

        // 2. CLEANUP (Start Transaction Here)
        console.log('🧹 Cleaning Operational Data...');
        await client.query('BEGIN');
        const tablesToTruncate = ['sale_items', 'sales', 'stock_movements', 'inventory_batches', 'shift_logs', 'cash_movements', 'queue_tickets', 'attendance_logs', 'customers'];
        for (const t of tablesToTruncate) {
            try {
                await client.query(`SAVEPOINT clean_${t}`);
                await client.query(`TRUNCATE TABLE ${t} CASCADE`);
                await client.query(`RELEASE SAVEPOINT clean_${t}`);
            } catch (e) {
                await client.query(`ROLLBACK TO SAVEPOINT clean_${t}`);
            }
        }

        // Re-create structural data
        console.log('🏗 Rebuilding Structure (Users, Locations, Warehouses)...');
        await client.query("SET session_replication_role = 'replica'");
        await client.query("DELETE FROM users");
        await client.query("DELETE FROM terminals");
        await client.query("DELETE FROM warehouses");
        await client.query("DELETE FROM locations");
        await client.query("SET session_replication_role = 'origin'");

        // 3. INFRASTRUCTURE & STAFF
        const warehouseMap = new Map<string, string>(); // Name -> ID
        const branchIds: string[] = [];
        const branchWarehouses: string[] = [];
        const employees: { id: string, storeId: string }[] = [];

        // Global Warehouses
        for (const w of WAREHOUSES) {
            const locId = uuidv4();
            await client.query(`INSERT INTO locations(id, type, name, address, rut) VALUES($1, 'HQ', $2, $3, '76.000.000-0')`, [locId, w.name, w.address]);
            const whId = uuidv4();
            await client.query(`INSERT INTO warehouses(id, location_id, name, is_active) VALUES($1, $2, $3, true)`, [whId, locId, w.name]);
            await client.query('UPDATE locations SET default_warehouse_id = $1 WHERE id = $2', [whId, locId]);
            warehouseMap.set(w.name, whId);
        }

        const generalWhId = warehouseMap.get('Bodega General')!;
        const auxWhId = warehouseMap.get('Bodega Auxiliar')!;

        // Branches
        for (const b of BRANCHES) {
            const storeId = uuidv4();
            await client.query(`INSERT INTO locations(id, type, name, address, phone, rut) VALUES($1, 'STORE', $2, $3, $4, '76.444.555-6')`, [storeId, b.name, b.address, b.phone]);

            const whId = uuidv4();
            await client.query(`INSERT INTO warehouses(id, location_id, name, is_active) VALUES($1, $2, $3, true)`, [whId, storeId, `Sala de Ventas - ${b.name}`]);
            await client.query('UPDATE locations SET default_warehouse_id = $1 WHERE id = $2', [whId, storeId]);

            branchIds.push(storeId);
            branchWarehouses.push(whId);

            // Terminals
            await client.query(`INSERT INTO terminals(id, location_id, name, status) VALUES($1, $2, 'Caja 1', 'CLOSED'), ($3, $2, 'Caja 2', 'CLOSED')`, [uuidv4(), storeId, uuidv4()]);

            // STAFF
            // 1. Admin/QF
            const adminId = uuidv4();
            await client.query(`
                INSERT INTO users(id, rut, name, role, access_pin, pin_hash, status, assigned_location_id, job_title, base_salary, afp, health_system)
                VALUES($1, $2, $3, 'MANAGER', '1213', $4, 'ACTIVE', $5, 'QUIMICO FARMACEUTICO', 1800000, $6, $7)
             `, [adminId, generateRut(), `${getRandomElement(CHILEAN_NAMES)} (QF)`, hashPin('1213'), storeId, getRandomElement(AFPS), getRandomElement(HEALTH_SYSTEMS)]);
            employees.push({ id: adminId, storeId });

            // 2. Cashiers
            for (let i = 0; i < 3; i++) {
                const cashId = uuidv4();
                await client.query(`
                    INSERT INTO users(id, rut, name, role, access_pin, pin_hash, status, assigned_location_id, job_title, base_salary, afp, health_system)
                    VALUES($1, $2, $3, 'CASHIER', '1213', $4, 'ACTIVE', $5, 'CAJERO VENDEDOR', 600000, $6, $7)
                 `, [cashId, generateRut(), `${getRandomElement(CHILEAN_NAMES)}`, hashPin('1213'), storeId, getRandomElement(AFPS), getRandomElement(HEALTH_SYSTEMS)]);
                employees.push({ id: cashId, storeId });
            }
        }

        // 4. CUSTOMERS (New)
        console.log('🤝 Creating Customers...');
        for (let i = 0; i < 10; i++) { // small batch for code logic, loop 50 times batch size
            const custBatchParams: string[] = [];
            const custBatchValues: any[] = [];
            let pIdx = 1;

            for (let k = 0; k < 50; k++) {
                custBatchParams.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
                custBatchValues.push(generateRut(), getRandomElement(CHILEAN_NAMES), 'cliente@demo.cl', '99999999', Math.random() > 0.5 ? 'POS' : 'TOTEM');
            }
            await client.query(`INSERT INTO customers(rut, name, email, phone, source) VALUES ${custBatchParams.join(', ')}`, custBatchValues);
        }
        console.log('   ✅ 500 Customers Created.');

        // 5. INVENTORY Injection
        console.log('📦 Stocking Warehouses (Legacy & 2025)...');

        // Fetch Products
        let products = (await client.query("SELECT id, sku, name, cost_price, sale_price FROM products")).rows;
        if (products.length === 0) {
            console.warn("⚠️ No products found. Creating dummy products...");
            const dummyProducts = [
                { sku: 'P1', name: 'Paracetamol 500mg', cost: 500, sale: 1500 },
                { sku: 'P2', name: 'Ibuprofeno 400mg', cost: 800, sale: 2500 },
                { sku: 'P3', name: 'Amoxicilina 500mg', cost: 2000, sale: 4500 },
                { sku: 'P4', name: 'Losartan 50mg', cost: 1500, sale: 3500 },
                { sku: 'P5', name: 'Atorvastatina 20mg', cost: 3000, sale: 7000 }
            ];
            for (const p of dummyProducts) {
                const id = uuidv4();
                await client.query(`INSERT INTO products(id, sku, name, cost_price, sale_price, stock_min, stock_max) VALUES($1, $2, $3, $4, $5, 10, 1000)`, [id, p.sku, p.name, p.cost, p.sale]);
            }
            products = (await client.query("SELECT id, sku, name, cost_price, sale_price FROM products")).rows;
        }

        // Prepare Inventory Batches
        const inventoryBatchValues: any[] = [];
        const inventoryBatchPlaceholders: string[] = [];

        const flushInventory = async () => {
            if (inventoryBatchValues.length === 0) return;
            const query = `
                INSERT INTO inventory_batches(
                    id, product_id, sku, name, location_id, warehouse_id,
                    quantity_real, expiry_date, lot_number,
                    cost_net, price_sell_box, stock_min, stock_max, unit_cost, sale_price
                ) VALUES ${inventoryBatchPlaceholders.join(', ')}
             `;
            await client.query(query, inventoryBatchValues);
            inventoryBatchValues.length = 0;
            inventoryBatchPlaceholders.length = 0;
            process.stdout.write('.');
        };

        // Optimizing Inventory Injection: Prefetch Location IDs
        const generalLocId = (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [generalWhId])).rows[0].location_id;
        const auxLocId = (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [auxWhId])).rows[0].location_id;

        const branchLocMap = new Map<string, string>();
        for (const whId of branchWarehouses) {
            const lId = (await client.query('SELECT location_id FROM warehouses WHERE id = $1', [whId])).rows[0].location_id;
            branchLocMap.set(whId, lId);
        }

        const allBatches = [];
        for (const p of products) {
            // General
            allBatches.push({ p, qty: 1000, whId: generalWhId, locId: generalLocId, lot: `L-GEN-${p.sku}` });
            // Aux
            allBatches.push({ p, qty: 500, whId: auxWhId, locId: auxLocId, lot: `L-AUX-${p.sku}` });
            // Stores
            for (const whId of branchWarehouses) {
                const locId = branchLocMap.get(whId);
                if (locId) {
                    allBatches.push({ p, qty: 100, whId: whId, locId, lot: `L-STORE-${p.sku}` });
                }
            }
        }

        // Execute Batch Insert
        for (let i = 0; i < allBatches.length; i += BATCH_SIZE) {
            const chunk = allBatches.slice(i, i + BATCH_SIZE);
            const vals = [];
            const places = [];
            let idx = 1;
            for (const item of chunk) {
                const expiryDate = new Date();
                expiryDate.setFullYear(2026);
                places.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, 10, 1000, $${idx++}, $${idx++})`);
                vals.push(uuidv4(), item.p.id, item.p.sku, item.p.name, item.locId, item.whId, item.qty, expiryDate, item.lot, item.p.cost_price || 1000, item.p.sale_price || 2000, item.p.cost_price || 1000, item.p.sale_price || 2000);
            }
            await client.query(`INSERT INTO inventory_batches(id, product_id, sku, name, location_id, warehouse_id, quantity_real, expiry_date, lot_number, cost_net, price_sell_box, stock_min, stock_max, unit_cost, sale_price) VALUES ${places.join(', ')}`, vals);
            process.stdout.write('.');
        }
        console.log('\n✅ Stock Batches Injected.');


        // 6. SALES SIMULATION (Nov - Dec 2025)
        console.log('💵 generating Sales (Nov/Dec 2025)...');

        // Load Inventory IDs for linking
        const inventoryRows = (await client.query(`SELECT id, sku, warehouse_id, quantity_real, unit_cost, sale_price FROM inventory_batches`)).rows;
        // Optimization: Map SKU+WH -> Batch[]
        const stockMap = new Map<string, any>();
        // e.g. "SKU123:WH-UUID" -> BatchObj
        for (const r of inventoryRows) {
            stockMap.set(`${r.sku}:${r.warehouse_id}`, r);
        }

        const salesToInsert = [];
        const saleItemsToInsert = [];
        const inventoryUpdates = new Map<string, number>(); // BatchID -> AmountSold

        const startDate = new Date('2025-11-01T08:00:00');
        const endDate = new Date('2025-12-31T20:00:00');
        const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));

        for (let i = 0; i <= totalDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);

            // Daily volume: 20-30 sales per store
            for (const storeId of branchIds) {
                const whId = branchWarehouses[branchIds.indexOf(storeId)];
                const dailyCount = Math.floor(Math.random() * 15) + 15; // 15-30 sales

                for (let t = 0; t < dailyCount; t++) {
                    const saleId = uuidv4();
                    const seller = getRandomElement(employees.filter(e => e.storeId === storeId));
                    const numItems = Math.floor(Math.random() * 3) + 1;

                    let total = 0;

                    // Items
                    for (let k = 0; k < numItems; k++) {
                        const prod = getRandomElement(products);
                        const qty = Math.floor(Math.random() * 2) + 1;
                        const price = Number(prod.sale_price) || 2000;
                        const batch = stockMap.get(`${prod.sku}:${whId}`);

                        if (!batch) continue; // Skip if no stock logic (should verify)

                        saleItemsToInsert.push({
                            id: uuidv4(),
                            sale_id: saleId,
                            batch_id: batch.id,
                            quantity: qty,
                            unit_price: price,
                            total_price: price * qty
                        });
                        total += (price * qty);

                        // Track inventory deduction
                        const curr = inventoryUpdates.get(batch.id) || 0;
                        inventoryUpdates.set(batch.id, curr + qty);
                    }

                    if (total === 0) continue;

                    salesToInsert.push({
                        id: saleId,
                        location_id: storeId,
                        user_id: seller?.id, // Should exist
                        total_amount: total,
                        total,
                        payment_method: Math.random() > 0.4 ? 'CARD' : 'CASH',
                        timestamp: new Date(currentDate.getTime() + Math.random() * 40000000), // Random time
                        dte_status: Math.random() > 0.8 ? 'ISSUED' : 'NOT_ISSUED' // Some unissued
                    });
                }
            }
        }

        console.log(`   🎲 Generated ${salesToInsert.length} sales. Inserting in chunks of ${BATCH_SIZE}...`);

        // Insert Sales Chunks
        for (let i = 0; i < salesToInsert.length; i += BATCH_SIZE) {
            const chunk = salesToInsert.slice(i, i + BATCH_SIZE);
            const vals = [];
            const places = [];
            let idx = 1;

            for (const s of chunk) {
                places.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
                vals.push(s.id, s.location_id, s.user_id, s.total_amount, s.total, s.payment_method, s.dte_status, s.timestamp);
            }

            await client.query(`INSERT INTO sales(id, location_id, user_id, total_amount, total, payment_method, dte_status, timestamp) VALUES ${places.join(', ')}`, vals);

            if (i % 500 === 0) process.stdout.write(` ${i}/${salesToInsert.length} `);
        }

        // Insert Sale Items Chunks
        console.log('\n   🛒 Inserting Sale Items...');
        for (let i = 0; i < saleItemsToInsert.length; i += BATCH_SIZE) {
            const chunk = saleItemsToInsert.slice(i, i + BATCH_SIZE);
            const vals = [];
            const places = [];
            let idx = 1;
            for (const it of chunk) {
                places.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
                vals.push(it.id, it.sale_id, it.batch_id, it.quantity, it.unit_price, it.total_price);
            }
            await client.query(`INSERT INTO sale_items(id, sale_id, batch_id, quantity, unit_price, total_price) VALUES ${places.join(', ')}`, vals);
            if (i % 1000 === 0) process.stdout.write('.');
        }

        // 7. FINANCIALS (Payroll & Expenses)
        console.log('\n💸 Processing Financials...');
        // Payroll (End of Nov, End of Dec)
        const payDates = [new Date('2025-11-30T10:00:00'), new Date('2025-12-30T10:00:00')];

        for (const idate of payDates) {
            for (const emp of employees) {
                // Determine salary based on role roughly
                // But we inserted them with base_salary in users table.
                // We'll just create a movement for "Pago Remuneraciones" linked to user? 
                // Table cash_movements usually links to store.
                // Let's create aggregated or individual records.
                // Individual is better for "High Fidelity".

                await client.query(`
                    INSERT INTO cash_movements(id, location_id, user_id, type, amount, reason, timestamp)
                    VALUES($1, $2, $3, 'EXPENSE', $4, 'Pago Remuneraciones Mensual', $5)
                `, [uuidv4(), emp.storeId, emp.id, 800000, idate]); // Using generic amount for speed, or query user salary
            }
        }

        // Inventory Decrement
        console.log('📉 Updating Inventory Counts...');
        const updates = Array.from(inventoryUpdates.entries());
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const chunk = updates.slice(i, i + BATCH_SIZE);
            const vals: any[] = [];
            const places: string[] = [];
            let idx = 1;
            for (const [bid, dec] of chunk) {
                places.push(`($${idx++}::uuid, $${idx++}::int)`);
                vals.push(bid, dec);
            }
            // Bulk update via FROM VALUES
            await client.query(`
                UPDATE inventory_batches AS b SET quantity_real = b.quantity_real - v.qty
                FROM (VALUES ${places.join(', ')}) AS v(id, qty)
                WHERE b.id = v.id
            `, vals);
        }

        await client.query('COMMIT');
        console.log('\n✅ Mission Complete. Data is Live & Realistic.');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('CRITICAL FAILURE:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
