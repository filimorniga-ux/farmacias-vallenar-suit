const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: undefined
    });

    try {
        await client.connect();

        const checkColumn = async (table, column) => {
            const res = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = $2
            `, [table, column]);
            return res.rows.length > 0;
        };

        const hasSessionInSales = await checkColumn('sales', 'session_id');
        const hasSessionInMovements = await checkColumn('cash_movements', 'session_id');
        const hasSessionInQuotes = await checkColumn('quotes', 'session_id'); // Curiosidad

        console.log({
            hasSessionInSales,
            hasSessionInMovements,
            hasSessionInQuotes
        });

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
