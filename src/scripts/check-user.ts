
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function checkUser() {
    try {
        await client.connect();

        console.log('--- USERS ILIKE "Gerente General" ---');
        const res = await client.query(`
            SELECT id, name, role, access_pin, access_pin_hash, is_active, assigned_location_id, token_version
            FROM users 
            WHERE name ILIKE '%Gerente General%'
        `);
        console.table(res.rows);

        if (res.rows.length > 0) {
            const userId = res.rows[0].id;
            console.log(`--- LOGIN ATTEMPTS FOR ${userId} ---`);
            const attempts = await client.query(`
                SELECT * FROM login_attempts WHERE identifier = $1
            `, [userId]);
            console.table(attempts.rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
checkUser();
