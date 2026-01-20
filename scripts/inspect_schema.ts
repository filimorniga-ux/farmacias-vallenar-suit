
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    const client = await pool.connect();
    try {
        const res = await client.query('SHOW search_path');
        console.log('🔍 Search Path:', res.rows[0].search_path);

        const tableRes = await client.query(`
            SELECT column_name, data_type, udt_name
            FROM information_schema.columns 
            WHERE table_name = 'products'
        `);
        console.log('📋 Columns:', tableRes.rows);

        // Check triggers
        const triggerRes = await client.query(`
            SELECT trigger_name, event_manipulation, action_statement 
            FROM information_schema.triggers 
            WHERE event_object_table = 'products'
        `);
        console.log('🔫 Triggers:', triggerRes.rows);

        // Try a manual insert of 1 row and see if it persists
        const testId = '00000000-0000-0000-0000-000000000001';
        console.log('🧪 Attempting test insert...');
        await client.query(`
            INSERT INTO products (id, sku, name) VALUES ($1, 'TEST-SKU-999', 'TEST PRODUCT')
            ON CONFLICT (id) DO NOTHING
        `, [testId]);

        const check = await client.query('SELECT count(*) FROM products WHERE id = $1', [testId]);
        console.log('✅ Test Insert Visible:', check.rows[0].count);

        await client.query('DELETE FROM products WHERE id = $1', [testId]);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}
inspect();
