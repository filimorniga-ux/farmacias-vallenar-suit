const pg = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const {
    assertLegacyDbWriteConfirmed,
    assertLegacyDbWriteTargetAllowed,
    redactConnectionString,
} = require('./legacy-db-script-guard.cjs');

const { Pool } = pg;
const APPLY_PRODUCTS_MIGRATION_ALLOW_NON_LOCAL_ENV = 'APPLY_PRODUCTS_MIGRATION_ALLOW_NON_LOCAL';
const APPLY_PRODUCTS_MIGRATION_CONFIRM_ENV = 'APPLY_PRODUCTS_MIGRATION_CONFIRM';
const APPLY_PRODUCTS_MIGRATION_CONFIRMATION = 'APPLY_SUPPLIER_PARSING_COLUMNS';

async function main() {
    console.log('🚀 Applying products columns migration...');
    const connectionString = process.env.DATABASE_URL;

    assertLegacyDbWriteConfirmed({
        confirmEnv: APPLY_PRODUCTS_MIGRATION_CONFIRM_ENV,
        confirmation: APPLY_PRODUCTS_MIGRATION_CONFIRMATION,
        description: 'apply supplier parsing columns migration',
    });
    assertLegacyDbWriteTargetAllowed({
        scriptName: 'apply-products-migration',
        connectionString,
        allowNonLocalEnv: APPLY_PRODUCTS_MIGRATION_ALLOW_NON_LOCAL_ENV,
    });
    console.log('🎯 DB target:', redactConnectionString(connectionString));

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const sqlPath = path.join(__dirname, '../migrations/add_supplier_parsing_columns.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing SQL:');
        console.log(sql);

        await pool.query(sql);
        console.log('✅ Migration applied successfully');
    } catch (e) {
        console.error('❌ Migration failed:', e);
    } finally {
        await pool.end();
    }
}

main();
