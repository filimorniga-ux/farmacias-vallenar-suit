
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function checkUsersSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
        console.log('Columns in users:');
        console.table(res.rows);
        process.exit(0);
    } catch (err) {
        console.error('Error querying schema:', err);
        process.exit(1);
    }
}

checkUsersSchema();
