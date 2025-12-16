
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT COUNT(*) FROM products WHERE isp_register IS NOT NULL AND isp_register != \'\'');
        console.log(`📊 Productos con ISP Register: ${res.rows[0].count}`);

        const res2 = await client.query('SELECT COUNT(*) FROM products');
        console.log(`📊 Total Productos: ${res2.rows[0].count}`);
    } finally {
        client.release();
        await pool.end();
    }
}
main().catch(console.error);
