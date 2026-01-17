import 'dotenv/config';
import { Client } from 'pg';

async function inspectSchema() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for Timescale/Neon usually
    });

    try {
        await client.connect();
        console.log('Inspecting notifications table schema...');
        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notifications';
    `);
        console.table(res.rows);
    } catch (error) {
        console.error('Error inspecting schema:', error);
    } finally {
        await client.end();
    }
}

inspectSchema();
