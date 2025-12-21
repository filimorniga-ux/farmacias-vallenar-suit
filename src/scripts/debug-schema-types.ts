import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT table_name, column_name, data_type, udt_name
            FROM information_schema.columns 
            WHERE table_name IN ('terminals', 'locations', 'cash_register_sessions')
            ORDER BY table_name, column_name;
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkSchema();
