
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

console.log('Testing connection to:', process.env.DATABASE_URL ? 'URL SET' : 'URL MISSING');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
});

pool.connect().then((client: any) => {
    console.log('✅ Connected!');
    client.query('SELECT COUNT(*) FROM productos').then((r: any) => {
        console.log('📊 Count:', r.rows[0].count);
        client.release();
        process.exit(0);
    }).catch((e: any) => {
        console.error('❌ Query Error:', e.message);
        process.exit(1);
    });
}).catch((e: any) => {
    console.error('❌ Connection Error:', e.message);
    process.exit(1);
});
