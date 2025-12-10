
import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Load envs
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

async function main() {
    console.log('🚚 Inyectando Datos Operativos (WMS + Gastos)...');

    // Dynamic import to use loaded env
    const dbModule = await import('../lib/db');
    const { query } = dbModule;

    try {
        // 1. Get Context
        const locRes = await query("SELECT id, name FROM locations WHERE type = 'STORE' LIMIT 1");
        const usersRes = await query("SELECT id FROM users LIMIT 1");
        // FETCH BATCHES to link movements correctly
        const batchesRes = await query(`
            SELECT ib.id as batch_id, ib.product_id, p.name, p.sku 
            FROM inventory_batches ib 
            JOIN products p ON ib.product_id::text = p.id::text 
            LIMIT 50
        `);
        // FETCH TERMINAL needed for cash_movements
        const termRes = await query("SELECT id FROM terminals LIMIT 1");

        if (locRes.rows.length === 0 || batchesRes.rows.length === 0 || termRes.rows.length === 0) {
            console.error('❌ Falta datos base (sucursales, lotes o terminales). Correr npm run seed:demo primero.');
            return;
        }

        const locationId = locRes.rows[0].id;
        const userId = usersRes.rows[0].id;
        const terminalId = termRes.rows[0].id;
        const batches = batchesRes.rows;

        // 2. Inject WMS History (Stock Movements)
        // Schema: id, sku, product_name, location_id, movement_type, quantity, stock_before, stock_after, timestamp, user_id, notes, batch_id
        console.log('📦 Generando Stock Movements...');

        const movementTypes = ['RECEIPT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT'];
        const movements = [];

        for (let i = 0; i < 100; i++) {
            const batch = batches[Math.floor(Math.random() * batches.length)];
            const type = movementTypes[Math.floor(Math.random() * movementTypes.length)];
            const qty = Math.floor(Math.random() * 20) + 1;

            // Random date in Nov/Dec
            const date = new Date(2025, 10 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 28) + 1);
            const notes = `Simulación WMS ${type}`;

            // Values need to be safely escaped or handled by param query ideally, but loop helper is fine for this script
            movements.push(`(
                '${uuidv4()}', 
                '${batch.sku || 'SKU-UNK'}', 
                '${batch.name.replace(/'/g, "''")}', 
                '${locationId}', 
                '${type}', 
                ${qty}, 
                100, 
                ${100 + qty}, 
                '${date.toISOString()}', 
                '${userId}', 
                '${notes}', 
                '${batch.batch_id}'
            )`);
        }

        if (movements.length > 0) {
            await query(`
                INSERT INTO stock_movements (id, sku, product_name, location_id, movement_type, quantity, stock_before, stock_after, timestamp, user_id, notes, batch_id)
                VALUES ${movements.join(',')}
            `);
            console.log(`✅ ${movements.length} Movimientos de stock insertados.`);
        }

        // 3. Inject Financial Expenses (Payroll, SocialSecurity, Ops)
        // Schema: id, location_id, user_id, type, amount, reason, timestamp, terminal_id
        // No shift_id, no description. 'reason' holds the text.
        console.log('💰 Generando Gastos Operativos...');

        const expenses = [];
        // Nov Payroll
        expenses.push(`('${uuidv4()}', '${locationId}', '${userId}', 'OUT', 4500000, 'PAYROLL: Nómina Noviembre', '2025-11-30 15:00:00', '${terminalId}')`);
        expenses.push(`('${uuidv4()}', '${locationId}', '${userId}', 'OUT', 850000, 'SOCIAL_SECURITY: Leyes Sociales Nov', '2025-11-30 15:05:00', '${terminalId}')`);
        expenses.push(`('${uuidv4()}', '${locationId}', '${userId}', 'OUT', 300000, 'EXPENSE: Arriendo Softland', '2025-11-05 10:00:00', '${terminalId}')`);

        // Dec Payroll (Partial/Advance)
        expenses.push(`('${uuidv4()}', '${locationId}', '${userId}', 'OUT', 1200000, 'PAYROLL: Anticipo Quincena Dic', '2025-12-15 10:00:00', '${terminalId}')`);
        expenses.push(`('${uuidv4()}', '${locationId}', '${userId}', 'OUT', 150000, 'EXPENSE: Insumos Aseo', '2025-12-02 11:00:00', '${terminalId}')`);
        expenses.push(`('${uuidv4()}', '${locationId}', '${userId}', 'OUT', 50000, 'EXPENSE: Caja Chica', '2025-12-05 14:00:00', '${terminalId}')`);

        if (expenses.length > 0) {
            await query(`
                INSERT INTO cash_movements (id, location_id, user_id, type, amount, reason, timestamp, terminal_id)
                VALUES ${expenses.join(',')}
            `);
            console.log(`✅ ${expenses.length} Gastos inyectados.`);
        }

    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();
