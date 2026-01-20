
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const res = await pool.query('SELECT count(*) FROM products');
        console.log('📊 Total Products in DB:', res.rows[0].count);

        const res2 = await pool.query('SELECT count(*) FROM products WHERE stock_total > 0');
        console.log('📦 Products with Stock:', res2.rows[0].count);

        // My enrichment didn't strictly add "origin" column to products table, it used tags?
        // MasterDataService persistence mapped fields to `products` columns.
        // It didn't save "origin" metadata column.
        // It saved `name`, `laboratory`, `dci`, `isp_register`.

        const resSample = await pool.query(`
            SELECT name, dci, laboratory, isp_register, stock_total 
            FROM products 
            LIMIT 3
        `);
        console.log('🧬 Sample Enriched (ISP):', resSample.rows);

        const sampleCenabast = await pool.query('SELECT name, dci FROM products WHERE name LIKE \'%GENERICO%\' OR dci IS NOT NULL LIMIT 3');
        console.log('🧬 Sample Cenabast (Generic):', sampleCenabast.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
