
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mimic seed script behavior
console.log('--- ENV DIAGNOSIS ---');
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
console.log('POSTGRES_URL_NON_POOLING:', process.env.POSTGRES_URL_NON_POOLING ? 'DEFINED' : 'MISSING');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'DEFINED' : 'MISSING');

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ No connection string found!');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

pool.connect().then(client => {
    const params = (client as any).connectionParameters;
    console.log(`🔌 [DIAGNOSTIC] Connected to Host: ${params.host}`);
    console.log(`🔌 [DIAGNOSTIC] Database: ${params.database}`);
    client.release();
}).catch(err => console.error('❌ Connection Check Failed:', err.message));

async function diagnose() {
    try {
        const client = await pool.connect();
        console.log('\n--- TABLES IN PUBLIC SCHEMA ---');
        const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        tables.rows.forEach(t => console.log(`- ${t.table_name}`));

        console.log('\n--- DATA COUNTS ---');

        const resInventory = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'inventory_batches'
            ) as exists;
        `);

        if (resInventory.rows[0].exists) {
            const count = await client.query('SELECT count(*) as count FROM inventory_batches');
            console.log(`Inventory Batches: ${count.rows[0].count}`);
        } else {
            console.log('Inventory Batches: TABLE MISSING');
        }

        console.log('\n--- ADMIN USER CHECK ---');
        const admins = await client.query("SELECT id, name, location_id FROM users WHERE role = 'admin' OR name ILIKE '%Admin%'");
        admins.rows.forEach(u => console.log(`- ${u.name}: Location=${u.location_id}`));

        client.release();
    } catch (err) {
        console.error('Error querying DB:', err);
    } finally {
        await pool.end();
    }
}

diagnose();
