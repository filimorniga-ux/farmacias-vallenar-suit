
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

// Load env vars
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true }); // Prefer .env.local if exists

const DB_SCRIPT_ALLOW_NON_LOCAL_ENV = 'DB_SCRIPT_ALLOW_NON_LOCAL';
const DB_SCRIPT_WRITE_CONFIRM_ENV = 'DB_SCRIPT_WRITE_CONFIRM';
const DB_SCRIPT_WRITE_CONFIRMATION = 'ALLOW_DB_SCRIPT_WRITES';
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ CRITICAL: DATABASE_URL not found in .env or .env.local');
    process.exit(1);
}

if (process.env[DB_SCRIPT_WRITE_CONFIRM_ENV] !== DB_SCRIPT_WRITE_CONFIRMATION) {
    console.error(
        `❌ Refusing to open generic DB script helper without explicit confirmation. ` +
        `Set ${DB_SCRIPT_WRITE_CONFIRM_ENV}=${DB_SCRIPT_WRITE_CONFIRMATION} to continue.`
    );
    process.exit(1);
}

assertScriptDbWriteTargetAllowed({
    scriptName: 'db_script',
    connectionString,
    allowNonLocalEnv: DB_SCRIPT_ALLOW_NON_LOCAL_ENV,
});

console.log('🎯 DB target:', redactConnectionString(connectionString));

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

export async function query(text: string, params?: any[]) {
    try {
        const res = await pool.query(text, params);
        return res;
    } catch (error) {
        console.error('❌ DB Error:', error);
        throw error;
    }
}

export async function closePool() {
    await pool.end();
}
