import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🔄 Agregando columnas faltantes a products...');

        await client.query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS description TEXT,
            ADD COLUMN IF NOT EXISTS format TEXT;
        `);

        console.log('✅ Columnas creadas/verificadas.');
    } catch (e) {
        console.error('❌ Error migrando:', e);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
