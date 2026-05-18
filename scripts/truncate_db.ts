
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

dotenv.config();

const TRUNCATE_DB_ALLOW_NON_LOCAL_ENV = 'TRUNCATE_DB_ALLOW_NON_LOCAL';
const TRUNCATE_DB_CONFIRM_ENV = 'TRUNCATE_DB_CONFIRM';
const TRUNCATE_DB_CONFIRMATION = 'TRUNCATE_INVENTORY_TABLES';
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
}

if (process.env[TRUNCATE_DB_CONFIRM_ENV] !== TRUNCATE_DB_CONFIRMATION) {
    console.error(
        `❌ Refusing to truncate inventory tables without explicit confirmation. ` +
        `Set ${TRUNCATE_DB_CONFIRM_ENV}=${TRUNCATE_DB_CONFIRMATION} to continue.`
    );
    process.exit(1);
}

assertScriptDbWriteTargetAllowed({
    scriptName: 'truncate_db',
    connectionString: dbUrl,
    allowNonLocalEnv: TRUNCATE_DB_ALLOW_NON_LOCAL_ENV,
});

console.log('🎯 DB target:', redactConnectionString(dbUrl));

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function truncate() {
    console.log('🗑️  Wiping inventory tables...');
    try {
        const client = await pool.connect();
        try {
            await client.query('TRUNCATE TABLE lotes, productos RESTART IDENTITY CASCADE;');
            console.log('✅ Tables truncated successfully.');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Error truncating tables:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

truncate();
