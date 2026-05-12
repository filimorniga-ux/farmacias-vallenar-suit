
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { redactConnectionString } from '../src/scripts/e2e-release-critical-db-policy';
import { assertScriptDbWriteTargetAllowed } from '../src/scripts/script-db-target-policy';

dotenv.config();

const RUN_ENRICHED_PRODUCT_MIGRATION_ALLOW_NON_LOCAL_ENV = 'RUN_ENRICHED_PRODUCT_MIGRATION_ALLOW_NON_LOCAL';
const RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRM_ENV = 'RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRM';
const RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRMATION = 'APPLY_ENRICHED_PRODUCT_FIELDS';
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
}

if (process.env[RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRM_ENV] !== RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRMATION) {
    console.error(
        `❌ Refusing to run enriched product migration without explicit confirmation. ` +
        `Set ${RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRM_ENV}=${RUN_ENRICHED_PRODUCT_MIGRATION_CONFIRMATION} to continue.`
    );
    process.exit(1);
}

assertScriptDbWriteTargetAllowed({
    scriptName: 'run_enriched_product_migration',
    connectionString: DB_URL,
    allowNonLocalEnv: RUN_ENRICHED_PRODUCT_MIGRATION_ALLOW_NON_LOCAL_ENV,
});

console.log('🎯 DB target:', redactConnectionString(DB_URL));

const pool = new Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
});

const MIGRATION_FILE = 'migrations/add_enriched_product_fields.sql';

async function runMigration() {
    console.log('🚀 Running Migration...');
    try {
        const sql = fs.readFileSync(path.resolve(process.cwd(), MIGRATION_FILE), 'utf-8');
        const client = await pool.connect();
        try {
            await client.query(sql);
            console.log('✅ Migration applied successfully.');
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('❌ Migration failed:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
