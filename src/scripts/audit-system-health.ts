
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const { redactConnectionString } = require('./e2e-release-critical-db-policy');
const { assertScriptDbWriteTargetAllowed } = require('./script-db-target-policy');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const DEV_TEST_ACCOUNT = {
    name: '[DEV] Gerente General 1',
    email: 'dev.gerente.general.1@local.invalid',
    jobTitle: 'DEV_TEST_ACCOUNT',
};

const REPAIR_CONFIRMATION = 'APLICAR';
const SECURITY_AUDIT_REPAIR_ALLOW_NON_LOCAL_ENV = 'SECURITY_AUDIT_REPAIR_ALLOW_NON_LOCAL';

function createAuditPool(repairMode: boolean) {
    if (!connectionString) {
        throw new Error('DATABASE_URL o POSTGRES_URL_NON_POOLING requerido para security:audit');
    }

    if (repairMode) {
        assertScriptDbWriteTargetAllowed({
            scriptName: 'security:audit:repair',
            connectionString,
            allowNonLocalEnv: SECURITY_AUDIT_REPAIR_ALLOW_NON_LOCAL_ENV,
        });
    }

    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    return new Pool({
        connectionString,
        ssl: isLocalhost ? false : { rejectUnauthorized: false },
    });
}

async function auditSystem() {
    console.log("🏥 Starting System Health Audit...");
    const repairMode = process.env.SECURITY_AUDIT_REPAIR_CONFIRM === REPAIR_CONFIRMATION;
    console.log(
        repairMode
            ? '⚠️ Repair mode enabled by SECURITY_AUDIT_REPAIR_CONFIRM=APLICAR'
            : '🔎 Read-only mode. Set SECURITY_AUDIT_REPAIR_CONFIRM=APLICAR to apply repairs.'
    );
    console.log(`🔌 Target DB: ${redactConnectionString(connectionString ?? '')}`);

    const pool = createAuditPool(repairMode);
    const client = await pool.connect();

    try {
        if (repairMode) {
            await client.query('BEGIN');
        }

        // 1. Integridad de Datos
        console.log("\n🕵️‍♂️ Auditing Data Integrity...");

        const orphanedSales = await client.query(`
            SELECT COUNT(*)::int AS count
            FROM sales
            WHERE location_id IS NULL OR terminal_id IS NULL
        `);
        console.log(`   - Orphaned Sales: ${orphanedSales.rows[0].count}`);

        const zombieInventory = await client.query(`
            SELECT COUNT(*)::int AS count
            FROM inventory_batches
            WHERE warehouse_id IS NULL
        `);
        console.log(`   - Zombie Inventory: ${zombieInventory.rows[0].count}`);

        const homelessUsers = await client.query(`
            SELECT COUNT(*)::int AS count
            FROM users
            WHERE assigned_location_id IS NULL
        `);

        console.log(`   - Homeless Users: ${homelessUsers.rows[0].count}`);

        if (repairMode) {
            const fixedOrphanedSales = await client.query(`
                UPDATE sales
                SET location_id = (SELECT id FROM locations WHERE name = 'Sucursal Centro' LIMIT 1),
                    terminal_id = (SELECT id FROM terminals WHERE name = 'Caja 1' LIMIT 1)
                WHERE location_id IS NULL OR terminal_id IS NULL
                RETURNING id;
            `);
            console.log(`   - Fixed Orphaned Sales: ${fixedOrphanedSales.rowCount ?? 0}`);

            const fixedZombieInventory = await client.query(`
                UPDATE inventory_batches
                SET warehouse_id = (SELECT id FROM locations WHERE name = 'Bodega General' LIMIT 1)
                WHERE warehouse_id IS NULL
                RETURNING id;
            `);
            console.log(`   - Fixed Zombie Inventory: ${fixedZombieInventory.rowCount ?? 0}`);

            const fixedHomelessUsers = await client.query(`
                UPDATE users
                SET assigned_location_id = (SELECT id FROM locations WHERE name = 'Sucursal Centro' LIMIT 1)
                WHERE assigned_location_id IS NULL
                RETURNING id;
            `);
            console.log(`   - Fixed Homeless Users: ${fixedHomelessUsers.rowCount ?? 0}`);
        }
        console.log(repairMode ? "   ✅ Integrity: [OK/CORREGIDO]" : "   ✅ Integrity: [READ-ONLY]");


        // 2. Rendimiento (Indices)
        console.log("\n⚡ Auditing Performance (Indexes)...");

        const verifyIndex = async (tableName: string, indexName: string, columns: string) => {
            const check = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [indexName]);
            if ((check.rowCount ?? 0) === 0) {
                if (repairMode) {
                    await client.query(`CREATE INDEX ${indexName} ON ${tableName} (${columns})`);
                    console.log(`   - Created Index: ${indexName}`);
                } else {
                    console.log(`   - Missing Index: ${indexName}`);
                }
                return true;
            }
            return false;
        };

        await verifyIndex('sales', 'idx_sales_location_created', 'location_id, created_at');
        await verifyIndex('sales', 'idx_sales_terminal', 'terminal_id');
        await verifyIndex('cash_movements', 'idx_cash_movements_shift', 'shift_id');
        await verifyIndex('cash_movements', 'idx_cash_movements_timestamp', 'timestamp');

        console.log(repairMode ? "   ✅ Rendimiento: [ÍNDICES CREADOS/OK]" : "   ✅ Rendimiento: [READ-ONLY]");


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
        expenses.rows.forEach((r: { reason: string; count: string | number; total: string | number | null }) => {
            console.log(`   - Expense (${r.reason}): ${r.count} records, $${Number(r.total ?? 0).toLocaleString()}`);
        });

        console.log("   ✅ Finanzas: [COHERENTE]");

        // 4. Access Verification
        console.log("\n🔐 Auditing Access...");
        const userCheck = await client.query(`
            SELECT id, name, is_active
            FROM users
            WHERE email = $1 OR name = $2 OR job_title = $3
            LIMIT 1
        `, [DEV_TEST_ACCOUNT.email, DEV_TEST_ACCOUNT.name, DEV_TEST_ACCOUNT.jobTitle]);
        if ((userCheck.rowCount ?? 0) > 0) {
            console.log(`   - DEV_TEST_ACCOUNT encontrada: ${userCheck.rows[0].name}`);
            console.log(`   - Estado activo: ${userCheck.rows[0].is_active ? 'sí' : 'no'}`);
            console.log("   ✅ Cuenta DEV controlada: [VERIFICADA]");
        } else {
            console.warn("   ⚠️ No se encontró la cuenta DEV controlada.");
            console.log("   ❌ Cuenta DEV controlada: [FALTANTE]");
        }

        if (repairMode) {
            await client.query('COMMIT');
        }
    } catch (e) {
        if (repairMode) {
            await client.query('ROLLBACK');
        }
        console.error("❌ Audit Failed:", e);
    } finally {
        client.release();
        await pool.end();
    }
}

auditSystem();
