
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        console.log('--- VERIFICATION START ---');

        // 1. Check Reconciliation
        const recRes = await pool.query(`
            SELECT declared_cash, system_calculated_cash, difference, created_at 
            FROM cash_reconciliations 
            ORDER BY created_at DESC 
            LIMIT 1
        `);

        console.log('RECONCILIATION:', JSON.stringify(recRes.rows[0] || null));

        // 2. Check Audit Log
        const auditRes = await pool.query(`
            SELECT action_code, user_role, checksum, created_at
            FROM audit_log 
            WHERE action_code = 'SESSION_CLOSE' 
            ORDER BY created_at DESC 
            LIMIT 1
        `);

        console.log('AUDIT_LOG:', JSON.stringify(auditRes.rows[0] || null));

        console.log('--- VERIFICATION END ---');
    } catch (error) {
        console.error('Error verifying DB:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
