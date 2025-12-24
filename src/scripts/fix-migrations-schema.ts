
import { pool } from '../lib/db-cli';

async function fixSchemaMigrations() {
    console.log('🔧 Fixing schema_migrations table...');
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
