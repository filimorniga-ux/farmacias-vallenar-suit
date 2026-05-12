
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const {
    assertLegacyDbWriteConfirmed,
    assertLegacyDbWriteTargetAllowed,
    redactConnectionString,
} = require('./legacy-db-script-guard.cjs');

const RUN_FUZZY_MIGRATION_ALLOW_NON_LOCAL_ENV = 'RUN_FUZZY_MIGRATION_ALLOW_NON_LOCAL';
const RUN_FUZZY_MIGRATION_CONFIRM_ENV = 'RUN_FUZZY_MIGRATION_CONFIRM';
const RUN_FUZZY_MIGRATION_CONFIRMATION = 'ENABLE_FUZZY_SEARCH';
const connectionString = process.env.DATABASE_URL;

assertLegacyDbWriteConfirmed({
    confirmEnv: RUN_FUZZY_MIGRATION_CONFIRM_ENV,
    confirmation: RUN_FUZZY_MIGRATION_CONFIRMATION,
    description: 'enable fuzzy search migration',
});
assertLegacyDbWriteTargetAllowed({
    scriptName: 'run-fuzzy-migration',
    connectionString,
    allowNonLocalEnv: RUN_FUZZY_MIGRATION_ALLOW_NON_LOCAL_ENV,
});
console.log('🎯 DB target:', redactConnectionString(connectionString));

const pool = new Pool({
    connectionString
});

async function main() {
    try {
        const client = await pool.connect();
        const sqlPath = path.join(__dirname, '../migrations/enable_fuzzy_search.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration successful!');
        client.release();
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}
main();
