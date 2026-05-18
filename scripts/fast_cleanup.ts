
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const FAST_CLEANUP_ALLOW_NON_LOCAL_ENV = 'FAST_CLEANUP_ALLOW_NON_LOCAL';
const FAST_CLEANUP_CONFIRM_ENV = 'FAST_CLEANUP_CONFIRM';
const FAST_CLEANUP_CONFIRMATION = 'DELETE_NAMELESS_ISP_PRODUCTS';
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
}

if (process.env[FAST_CLEANUP_CONFIRM_ENV] !== FAST_CLEANUP_CONFIRMATION) {
    console.error(
        `❌ Refusing to delete nameless ISP products without explicit confirmation. ` +
        `Set ${FAST_CLEANUP_CONFIRM_ENV}=${FAST_CLEANUP_CONFIRMATION} to continue.`
    );
    process.exit(1);
}

assertScriptDbWriteTargetAllowed({
    scriptName: 'fast_cleanup',
    connectionString: dbUrl,
    allowNonLocalEnv: FAST_CLEANUP_ALLOW_NON_LOCAL_ENV,
});

console.log('🎯 DB target:', redactConnectionString(dbUrl));

const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

async function run() {
    try {
        console.log("🚀 Executing Bulk Cleanup...");
        const res = await pool.query(`
            DELETE FROM products 
            WHERE (name IS NULL OR name = '' OR name = 'Sin Nombre')
            AND source_system = 'ISP'
            AND stock_actual <= 0
        `);
        console.log(`✅ Deleted ${res.rowCount} records.`);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await pool.end();
    }
}
run();
