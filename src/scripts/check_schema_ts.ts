
import { query } from '../lib/db';
import dotenv from 'dotenv';
dotenv.config();

async function checkSchema() {
    try {
        const res = await query(`
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
