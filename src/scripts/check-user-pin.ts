
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

async function checkUserHelper() {
    try {
        console.log('Connecting to DB...');
        const client = await pool.connect();
        try {
            console.log('🔎 Searching for "Gerente General 1" or similar...');

            const result = await client.query(`
                SELECT id, name, role, access_pin, is_active 
                FROM users 
                WHERE name ILIKE '%Gerente General%' 
                OR role = 'GERENTE_GENERAL'
                OR role = 'MANAGER'
            `);

            console.log(`Found ${result.rowCount} users:`);
            console.table(result.rows);

            // Check specifically for universal PIN
            const invalidUsers = result.rows.filter(u => u.access_pin !== '1213');
            if (invalidUsers.length > 0) {
                console.log('⚠️ WARNING: The following users do NOT have PIN 1213:');
                console.table(invalidUsers);

                // FORCE UPDATE
                console.log('🔄 Forcing update for these users...');
                for (const u of invalidUsers) {
                    await client.query('UPDATE users SET access_pin = $1 WHERE id = $2', ['1213', u.id]);
                    console.log(`✅ Updated ${u.name} (${u.id}) to PIN 1213`);
                }
            } else {
                console.log('✅ All matched users have PIN 1213.');
            }

        } finally {
            client.release();
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

checkUserHelper();
