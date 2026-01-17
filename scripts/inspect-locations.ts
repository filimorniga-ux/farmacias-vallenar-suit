
import 'dotenv/config';
import { Client } from 'pg';

async function inspectLocations() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Inspecting locations table data...');
        const res = await client.query(`
      SELECT id, name, is_active FROM locations;
    `);
        console.table(res.rows);
    } catch (error) {
        console.error('Error inspecting locations:', error);
    } finally {
        await client.end();
    }
}

inspectLocations();
