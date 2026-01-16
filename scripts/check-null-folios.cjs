const pg = require('pg');
require('dotenv').config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
    console.log('🔌 Checking sales with null dte_folio...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const query = `
            SELECT dte_type, COUNT(*) 
            FROM sales 
            WHERE dte_folio IS NULL
            GROUP BY dte_type;
        `;
        const res = await pool.query(query);
        console.table(res.rows);

        // Also check if there are any distinct 'status' that might indicate non-fiscal
        const statusQuery = `
             SELECT status, COUNT(*) 
            FROM sales 
            GROUP BY status;
        `;
        const resStatus = await pool.query(statusQuery);
        console.table(resStatus.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

main();
