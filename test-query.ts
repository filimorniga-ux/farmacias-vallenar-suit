import { pool } from './src/lib/db';

async function run() {
    const res = await pool.query(`
        SELECT p.id, p.name, p.sku
        FROM products p
        WHERE p.name ILIKE '%10VITS%' OR p.name ILIKE '%3-A OFTENO%'
    `);
    console.log("Found products:", res.rows);
    process.exit(0);
}
run().catch(console.error);
