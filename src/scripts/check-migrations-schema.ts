
import { pool } from '../lib/db-cli';

async function checkSchemaMigrations() {
    const client = await pool.connect();
    try {
        const query = `
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns 
            WHERE table_name = 'schema_migrations';
        `;

        const res = await client.query(query);
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkSchemaMigrations();
