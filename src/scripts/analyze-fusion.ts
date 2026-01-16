
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function check() {
    await client.connect();
    // Check completeness
    const res = await client.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(units_per_box) as has_units,
            COUNT(is_bioequivalent) as has_bio,
            COUNT(dci) as has_dci,
            COUNT(isp_register) as has_isp,
            COUNT(barcode) as has_barcode
        FROM products
    `);
    console.table(res.rows);

    // Check potentially mergeable items
    // Same Normalized Name, Different IDs?
    const res2 = await client.query(`
        SELECT upper(name) as uname, count(*) as c 
        FROM products 
        GROUP BY uname 
        HAVING count(*) > 1
        ORDER BY c DESC
        LIMIT 10
    `);
    console.log("\nPotential Matches (Duplicates by Name):");
    console.table(res2.rows);

    await client.end();
}
check();
