
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) dotenv.config({ path: '.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("=== VERIFYING DEMO DATA ===");

        const counts = {
            locations: (await pool.query("SELECT COUNT(*) FROM locations WHERE name IN ('Farmacia Santiago Centro', 'Farmacia Colchagua Prat')")).rows[0].count,
            terminals: (await pool.query("SELECT COUNT(*) FROM terminals WHERE name LIKE 'Caja %'")).rows[0].count,
            users: (await pool.query("SELECT COUNT(*) FROM users WHERE email LIKE '%@demo.cl' OR email LIKE 'cajero.%'")).rows[0].count,
            customers: (await pool.query("SELECT COUNT(*) FROM customers")).rows[0].count,
            sales: (await pool.query("SELECT COUNT(*) FROM sales")).rows[0].count,
            sessions: (await pool.query("SELECT COUNT(*) FROM cash_register_sessions")).rows[0].count,
            inventory_batches: (await pool.query("SELECT COUNT(*) FROM inventory_batches")).rows[0].count
        };

        console.log(JSON.stringify(counts, null, 2));

        if (parseInt(counts.locations) >= 2 && parseInt(counts.terminals) >= 8 && parseInt(counts.users) >= 12 && parseInt(counts.sales) > 0) {
            console.log("✅ Verification SUCCESS: Data populated correctly.");
        } else {
            console.warn("⚠️ Verification WARNING: Some counts are lower than expected.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
