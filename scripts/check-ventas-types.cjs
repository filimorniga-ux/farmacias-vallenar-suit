const pg = require('pg');
require('dotenv').config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
    console.log('🔌 Checking tipo_boleta values...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const query = `
            SELECT tipo_boleta, COUNT(*) 
            FROM ventas 
            GROUP BY tipo_boleta;
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
