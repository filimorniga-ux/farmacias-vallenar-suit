
import { pool } from '../lib/db-cli';

async function checkTypes() {
    const client = await pool.connect();
    try {
        const query = `
            SELECT table_name, column_name, data_type, udt_name
            FROM information_schema.columns 
            WHERE table_name IN ('cash_register_sessions', 'cash_movements')
            AND column_name IN ('id', 'session_id');
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

checkTypes();
