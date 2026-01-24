import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

pool.connect().then((client: any) => {
    client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'products'
        ORDER BY column_name;
    `).then((r: any) => {
        console.table(r.rows);
        client.release();
        process.exit(0);
    }).catch((e: any) => {
        console.error(e);
        process.exit(1);
    });
});
