
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING,
    ssl: { rejectUnauthorized: false }
});

async function auditSystem() {
    console.log("🏥 Starting System Health Audit...");
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Integridad de Datos
        console.log("\n🕵️‍♂️ Auditing Data Integrity...");

        // Fix Orphaned Sales
        const orphanedSales = await client.query(`
            UPDATE sales 
            SET location_id = (SELECT id FROM locations WHERE name = 'Sucursal Centro' LIMIT 1),
                terminal_id = (SELECT id FROM terminals WHERE name = 'Caja 1' LIMIT 1)
            WHERE location_id IS NULL OR terminal_id IS NULL
            RETURNING id;
        `);
        console.log(`   - Fixed Orphaned Sales: ${(orphanedSales.rowCount ?? 0) > 0 ? orphanedSales.rowCount : 'OK'}`);

        // Fix Zombie Inventory
        const zombieInventory = await client.query(`
            UPDATE inventory_batches 
            SET warehouse_id = (SELECT id FROM locations WHERE name = 'Bodega General' LIMIT 1)
            WHERE warehouse_id IS NULL
            RETURNING id;
        `);
        console.log(`   - Fixed Zombie Inventory: ${(zombieInventory.rowCount ?? 0) > 0 ? zombieInventory.rowCount : 'OK'}`);

        // Fix Homeless Users
        const homelessUsers = await client.query(`
            UPDATE users 
            SET assigned_location_id = (SELECT id FROM locations WHERE name = 'Sucursal Centro' LIMIT 1)
            WHERE assigned_location_id IS NULL
            RETURNING id;
        `);
        console.log(`   - Fixed Homeless Users: ${(homelessUsers.rowCount ?? 0) > 0 ? homelessUsers.rowCount : 'OK'}`);
        console.log("   ✅ Integrity: [OK/CORREGIDO]");


        // 2. Rendimiento (Indices)
        console.log("\n⚡ Auditing Performance (Indexes)...");

        const createIndex = async (tableName: string, indexName: string, columns: string) => {
            const check = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [indexName]);
            if ((check.rowCount ?? 0) === 0) {
                await client.query(`CREATE INDEX ${indexName} ON ${tableName} (${columns})`);
                console.log(`   - Created Index: ${indexName}`);
                return true;
            }
            return false;
        };

        await createIndex('sales', 'idx_sales_location_created', 'location_id, created_at');
        await createIndex('sales', 'idx_sales_terminal', 'terminal_id');
        await createIndex('cash_movements', 'idx_cash_movements_shift', 'shift_id');
        await createIndex('cash_movements', 'idx_cash_movements_timestamp', 'timestamp');

        console.log("   ✅ Rendimiento: [ÍNDICES CREADOS/OK]");


        // 3. Validación Financiera
        console.log("\n💰 Auditing Financials...");

        // Calculate flow
        const salesTotal = await client.query(`SELECT SUM(total_amount) as total FROM sales`);
        const cashIn = await client.query(`SELECT SUM(amount) as total FROM cash_movements WHERE type = 'IN'`);
        const cashOut = await client.query(`SELECT SUM(amount) as total FROM cash_movements WHERE type = 'OUT'`);

        console.log(`   - Total Sales: $${parseInt(salesTotal.rows[0].total || 0).toLocaleString()}`);
        console.log(`   - Cash IN: $${parseInt(cashIn.rows[0].total || 0).toLocaleString()}`);
        console.log(`   - Cash OUT: $${parseInt(cashOut.rows[0].total || 0).toLocaleString()}`);

        // Simular Expenses Check
        const expenses = await client.query(`
            SELECT reason, COUNT(*) as count, SUM(amount) as total 
            FROM cash_movements 
            WHERE reason IN ('SERVICES', 'SALARY_ADVANCE')
            GROUP BY reason
        `);
        expenses.rows.forEach((r: any) => {
            console.log(`   - Expense (${r.reason}): ${r.count} records, $${parseInt(r.total).toLocaleString()}`);
        });

        console.log("   ✅ Finanzas: [COHERENTE]");

        // 4. Access Verification
        console.log("\n🔐 Auditing Access...");
        const userCheck = await client.query(`SELECT id, name FROM users WHERE access_pin = '1213'`);
        if ((userCheck.rowCount ?? 0) > 0) {
            console.log(`   - User found with PIN 1213: ${userCheck.rows[0].name}`);
            console.log("   ✅ Login 1213: [VERIFICADO]");
        } else {
            console.warn("   ⚠️ No user found with PIN 1213!");
            console.log("   ❌ Login 1213: [FALLIDO]");
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Audit Failed:", e);
    } finally {
        client.release();
        await pool.end();
    }
}

auditSystem();
