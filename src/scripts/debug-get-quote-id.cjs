const { Client } = require('pg');

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.DATABASE_URL;

async function getQuoteId() {
    const client = new Client({
        connectionString: connectionString,
        ssl: undefined
    });

    try {
        await client.connect();
        const res = await client.query('SELECT id, code FROM quotes LIMIT 1');
        console.log('Quotes found:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

getQuoteId();
