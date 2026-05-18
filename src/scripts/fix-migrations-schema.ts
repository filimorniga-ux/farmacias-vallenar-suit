
import { pool } from '../lib/db-cli';
import { assertScriptDbWriteTargetAllowed } from './script-db-target-policy';

const FIX_MIGRATIONS_SCHEMA_ALLOW_NON_LOCAL_ENV = 'FIX_MIGRATIONS_SCHEMA_ALLOW_NON_LOCAL';

async function fixSchemaMigrations() {
    console.log('🔧 Fixing schema_migrations table...');
    assertScriptDbWriteTargetAllowed({
        scriptName: 'fix-migrations-schema',
        connectionString: process.env.DATABASE_URL,
        allowNonLocalEnv: FIX_MIGRATIONS_SCHEMA_ALLOW_NON_LOCAL_ENV,
    });

    const client = await pool.connect();
    try {
        await client.query('ALTER TABLE schema_migrations ALTER COLUMN version TYPE VARCHAR(100);');
        console.log('✅ schema_migrations.version resized to VARCHAR(100)');
    } catch (err) {
        console.error('❌ Failed to resize column:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

fixSchemaMigrations();
