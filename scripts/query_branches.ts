
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkBranches() {
    console.log('🔍 Checking Branches/Warehouses...');
    try {
        const client = await pool.connect();
        try {
            // Try to guess table names if 'bodegas' or 'sucursales' exist
            const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('bodegas', 'sucursales', 'stores', 'warehouses', 'locations');
      `);
            console.log('📂 Found Tables:', tablesRes.rows.map(r => r.table_name));

            // Attempt to query content if tables exist
            for (const row of tablesRes.rows) {
                const tableName = row.table_name;
                console.log(`\n📄 Content of ${tableName}:`);
                const content = await client.query(`SELECT * FROM ${tableName} LIMIT 5`);
                console.table(content.rows);
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

checkBranches();
