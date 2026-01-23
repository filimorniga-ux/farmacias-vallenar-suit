
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspectSchema() {
    console.log('🔍 Inspecting App Schema...');
    try {
        const client = await pool.connect();
        try {
            const targetTables = ['products', 'inventory_batches', 'warehouses'];

            for (const table of targetTables) {
                console.log(`\n📋 Columns for table: ${table}`);
                const res = await client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = '${table}';
        `);
                console.table(res.rows);
            }

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

inspectSchema();
