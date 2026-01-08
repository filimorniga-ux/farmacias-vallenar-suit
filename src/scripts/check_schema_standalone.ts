
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Config from src/lib/db.ts
const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
};

const pool = new Pool(connectionConfig);

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cash_register_sessions'
      ORDER BY ordinal_position;
    `);
        console.log('Columns in cash_register_sessions:');
        console.table(res.rows);
        process.exit(0);
    } catch (err) {
        console.error('Error querying schema:', err);
        process.exit(1);
    }
}

checkSchema();
