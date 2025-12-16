import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inventory_batches';
    `);
        console.log('Schema for inventory_batches:', res.rows);

        const dataSample = await pool.query('SELECT id, location_id, warehouse_id FROM inventory_batches LIMIT 5');
        console.log('Sample Data:', dataSample.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkSchema();
