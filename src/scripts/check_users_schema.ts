
import { query } from './standalone_db';

async function checkUsersSchema() {
    console.log('🔍 Checking Schema for USERS...');
    const res = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'id'
    `);
    console.table(res.rows);
    process.exit(0);
}

checkUsersSchema().catch(console.error);
