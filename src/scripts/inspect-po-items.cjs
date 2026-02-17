
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
    const dbUrl = process.env.DATABASE_URL;
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    const poIds = [
        '19b27883-6e28-4d92-8614-7abbf4ba526c',
        'e1789f45-1588-4753-bb10-4f185eb08bda',
        'bc066ede-3ab3-4723-a8f2-33f69c07e1d5'
    ];

    try {
        const client = await pool.connect();

        for (const id of poIds) {
            console.log(`\n--- Items for PO: ${id} ---`);
            const res = await client.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [id]);
            console.table(res.rows);
        }

        client.release();
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
        process.exit();
    }
}

main();
