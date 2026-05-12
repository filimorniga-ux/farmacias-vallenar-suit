const pg = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const {
    assertLegacyDbWriteConfirmed,
    assertLegacyDbWriteTargetAllowed,
    redactConnectionString,
} = require('./legacy-db-script-guard.cjs');

const { Pool } = pg;
const APPLY_RECIBO_MIGRATION_ALLOW_NON_LOCAL_ENV = 'APPLY_RECIBO_MIGRATION_ALLOW_NON_LOCAL';
const APPLY_RECIBO_MIGRATION_CONFIRM_ENV = 'APPLY_RECIBO_MIGRATION_CONFIRM';
const APPLY_RECIBO_MIGRATION_CONFIRMATION = 'MIGRATE_BOLETAS_TO_RECIBOS';

async function main() {
    console.log('🔌 Applying migration...');
    const connectionString = process.env.DATABASE_URL;

    assertLegacyDbWriteConfirmed({
        confirmEnv: APPLY_RECIBO_MIGRATION_CONFIRM_ENV,
        confirmation: APPLY_RECIBO_MIGRATION_CONFIRMATION,
        description: 'migrate boletas to recibos',
    });
    assertLegacyDbWriteTargetAllowed({
        scriptName: 'apply-recibo-migration',
        connectionString,
        allowNonLocalEnv: APPLY_RECIBO_MIGRATION_ALLOW_NON_LOCAL_ENV,
    });
    console.log('🎯 DB target:', redactConnectionString(connectionString));

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const sql = fs.readFileSync('migrations/migrate_boletas_to_recibos.sql', 'utf8');
        await pool.query(sql);
        console.log('✅ Migration applied successfully.');

        // Verify
        const res = await pool.query("SELECT dte_type, COUNT(*) FROM sales GROUP BY dte_type");
        console.table(res.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
