
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkHost() {
    console.log('🔍 Inspecting Database Connection...');
    try {
        const client = await pool.connect();
        try {
            const res = await client.query('SELECT inet_server_addr(), inet_server_port(), current_database();');
            console.log('✅ Connected to:');
            console.log('   Host IP:', res.rows[0].inet_server_addr);
            console.log('   Port:', res.rows[0].inet_server_port);
            console.log('   Database Name:', res.rows[0].current_database);

            const countRes = await client.query('SELECT count(*) FROM productos');
            console.log('📊 Product Count:', countRes.rows[0].count);

        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Error checking DB:', error);
    } finally {
        await pool.end();
    }
}

checkHost();
