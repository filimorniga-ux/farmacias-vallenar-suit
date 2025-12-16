
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) dotenv.config({ path: '.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20 // Increase pool for parallelism
});

async function query(text: string, params?: any[]) {
    return pool.query(text, params);
}

const DAYS_TO_SIMULATE = 30;

function getRandomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function simulate() {
    console.log("=== SIMULATING OPERATIONS (LAST 30 DAYS - FAST MODE) ===");

    try {
        console.log("Loading Metadata...");
        const terminals = (await query("SELECT id, location_id, name FROM terminals WHERE is_active=true")).rows;
        const users = (await query("SELECT id, assigned_location_id, email FROM users WHERE role='CASHIER'")).rows;
        const customers = (await query("SELECT id, name, rut FROM customers WHERE rut IS NOT NULL")).rows;
        // Limit products for speed
        const products = (await query("SELECT id, name, price FROM products LIMIT 100")).rows;

        if (products.length === 0 || customers.length === 0) {
            console.warn("⚠️ Data missing!");
            return;
        }

        const cashiersByLoc: Record<string, any[]> = {};
        users.forEach(u => {
            if (u.assigned_location_id) {
                if (!cashiersByLoc[u.assigned_location_id]) cashiersByLoc[u.assigned_location_id] = [];
                cashiersByLoc[u.assigned_location_id].push(u);
            }
        });
        const terminalsByLoc: Record<string, any[]> = {};
        terminals.forEach(t => { if (t.location_id) { if (!terminalsByLoc[t.location_id]) terminalsByLoc[t.location_id] = []; terminalsByLoc[t.location_id].push(t); } });

        // Initial Stock
        console.log("💉 Injecting Stock...");
        const warehouseRes = await query("SELECT id FROM locations WHERE type='WAREHOUSE' LIMIT 1");
        const defaultWarehouseId = warehouseRes.rows[0]?.id || null;

        // Serial stock injection is fine (once)
        for (const prod of products) {
            const batches = await query("SELECT id FROM inventory_batches WHERE product_id = $1 LIMIT 1", [prod.id]);
            if (batches.rows.length === 0) {
                await query(`INSERT INTO inventory_batches (id, product_id, quantity_real, created_at, warehouse_id) VALUES ($1, $2, 5000, NOW(), $3)`, [uuidv4(), prod.id, defaultWarehouseId]);
            } else {
                await query("UPDATE inventory_batches SET quantity_real = quantity_real + 5000 WHERE id = $1", [batches.rows[0].id]);
            }
        }

        // Loop Days
        const today = new Date();
        for (let d = DAYS_TO_SIMULATE; d >= 0; d--) {
            const date = new Date(today);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().split('T')[0];
            console.log(`\n📅 Simulating Day: ${dateStr}`);

            const promises = [];

            for (const [locId, locTerminals] of Object.entries(terminalsByLoc)) {
                if (!cashiersByLoc[locId] || cashiersByLoc[locId].length === 0) continue;
                const locCashiers = cashiersByLoc[locId];
                const cycledCashiers = [...locCashiers].sort(() => 0.5 - Math.random());

                for (let i = 0; i < locTerminals.length; i++) {
                    const cashierAM = cycledCashiers[i % cycledCashiers.length];
                    const cashierPM = cycledCashiers[(i + 1) % cycledCashiers.length];

                    promises.push(simulateShift(date, locTerminals[i], cashierAM, 'AM', products, customers));
                    promises.push(simulateShift(date, locTerminals[i], cashierPM, 'PM', products, customers));
                }
            }
            // Run all shifts for this day in parallel
            await Promise.all(promises);
        }
        console.log("\n✅ SIMULATION COMPLETE.");
    } catch (e) {
        console.error("Simulation Failed:", e);
    } finally {
        await pool.end();
    }
}

async function simulateShift(date: Date, terminal: any, cashier: any, shiftType: string, products: any[], customers: any[]) {
    if (!cashier) return;
    const client = await pool.connect(); // Use dedicated client for transaction if needed, or just pool
    try {
        const startHour = shiftType === 'AM' ? 8 : 14;
        const endHour = shiftType === 'AM' ? 14 : 21;
        const openTime = new Date(date); openTime.setHours(startHour, 0, 0);
        const closeTime = new Date(date); closeTime.setHours(endHour, 0, 0);
        const openingAmount = 50000;
        let totalSales = 0;
        const sessionId = uuidv4();
        const numSales = getRandomInt(3, 8); // Fewer sales for speed

        for (let k = 0; k < numSales; k++) {
            const saleTime = new Date(openTime.getTime() + Math.random() * (closeTime.getTime() - openTime.getTime()));
            const customer = customers[getRandomInt(0, customers.length - 1)];
            const saleId = uuidv4();

            const numItems = getRandomInt(1, 3);
            let saleTotal = 0;

            for (let j = 0; j < numItems; j++) {
                const prod = products[getRandomInt(0, products.length - 1)];
                const qty = getRandomInt(1, 2);
                const lineTotal = (prod.price || 0) * qty;

                // Optimistic batch update (skip select if possible, but need ID)
                // Cache batch ID? No, just quick query.
                const batchRes = await client.query("SELECT id FROM inventory_batches WHERE product_id=$1 LIMIT 1", [prod.id]);
                const batchId = batchRes.rows[0]?.id;

                if (batchId) {
                    await client.query(`INSERT INTO sale_items (id, sale_id, batch_id, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6)`, [uuidv4(), saleId, batchId, qty, prod.price || 0, lineTotal]);
                    await client.query("UPDATE inventory_batches SET quantity_real = quantity_real - $1 WHERE id = $2", [qty, batchId]);
                }
                saleTotal += lineTotal;
            }

            await client.query(`INSERT INTO sales (id, customer_rut, total_amount, total, timestamp, terminal_id, user_id, payment_method) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CASH')`, [saleId, customer.rut, saleTotal, saleTotal, saleTime, terminal.id, cashier.id]);

            const points = Math.floor(saleTotal * 0.01);
            if (points > 0) {
                await client.query("UPDATE customers SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2", [points, customer.id]);
            }
            totalSales += saleTotal;
        }

        await client.query(`INSERT INTO cash_register_sessions (id, terminal_id, user_id, opened_at, closed_at, opening_amount, closing_amount, status, blind_counts) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CLOSED', 0)`, [sessionId, terminal.id, cashier.id, openTime, closeTime, openingAmount, openingAmount + totalSales]);
    } finally {
        client.release();
    }
}

simulate();
