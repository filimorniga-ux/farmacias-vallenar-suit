
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkV2() {
    console.log('🔍 Checking V2 Counts...');
    try {
        const client = await pool.connect();
        try {
            const pRes = await client.query('SELECT count(*) FROM products');
            const bRes = await client.query('SELECT count(*) FROM inventory_batches');

            console.log('📊 Final Counts:');
            console.log('   Products:', pRes.rows[0].count);
            console.log('   Batches:', bRes.rows[0].count);

            if (parseInt(pRes.rows[0].count) !== 7182) console.warn('⚠️ Product count mismatch!');
            if (parseInt(bRes.rows[0].count) !== 28728) console.warn('⚠️ Batch count mismatch!');

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

checkV2();
