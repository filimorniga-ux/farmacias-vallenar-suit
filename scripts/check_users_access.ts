
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkUsers() {
    try {
        console.log('🔍 Checking Users for Access Control (Manager/Admin)...');

        const users = await pool.query(`
            SELECT id, name, email, role, access_pin, status 
            FROM users 
            ORDER BY role DESC, name ASC
        `);

        console.table(users.rows.map(u => ({
            Name: u.name,
            Role: u.role,
            PIN: u.access_pin || 'NULL',
            Status: u.status
        })));

    } catch (e: any) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkUsers();
