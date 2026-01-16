const pg = require('pg');
require('dotenv').config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
    console.log('🔌 Inspecting products price columns...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const query = `
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'products' 
            AND column_name IN ('sale_price', 'price', 'price_sell_box', 'price_sell_unit', 'cost_price')
            ORDER BY ordinal_position;
        `;
        const res = await pool.query(query);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
