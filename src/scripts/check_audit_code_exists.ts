import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Checking audit_action_catalog for PRODUCT codes...');
        const res = await client.query(`
            SELECT code, category FROM audit_action_catalog 
            WHERE code IN ('PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_PRICE_CHANGED', 'PRODUCT_DEACTIVATED')
        `);
        console.table(res.rows);

        if (res.rows.length === 0) {
            console.log('❌ No codes found!');
        } else {
            console.log('✅ Found', res.rows.length, 'codes.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}
run();
