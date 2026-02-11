
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

const DEV_PIN = '1213';

async function resetAllPinsToDev() {
    try {
        console.log('🔌 Connecting to DB...');
        const client = await pool.connect();
        try {
            // 1. Show current state
            const before = await client.query(`
                SELECT id, name, role, access_pin, 
                       access_pin_hash IS NOT NULL as has_hash, 
                       is_active 
                FROM users 
                ORDER BY role, name
            `);

            console.log(`\n📋 Found ${before.rowCount} users in the database:`);
            console.table(before.rows);

            // 2. Update ALL users: set plaintext PIN and CLEAR hash
            const updateResult = await client.query(`
                UPDATE users 
                SET access_pin = $1, 
                    access_pin_hash = NULL 
                WHERE access_pin != $1 
                   OR access_pin_hash IS NOT NULL 
                   OR access_pin IS NULL
            `, [DEV_PIN]);

            console.log(`\n✅ Updated ${updateResult.rowCount} users to PIN '${DEV_PIN}'`);
            console.log('🧹 Cleared all bcrypt hashes (access_pin_hash = NULL)');

            // 3. Verify
            const after = await client.query(`
                SELECT id, name, role, access_pin, 
                       access_pin_hash IS NOT NULL as has_hash
                FROM users 
                ORDER BY role, name
            `);

            console.log('\n📋 Final state:');
            console.table(after.rows);

            const allGood = after.rows.every(u => u.access_pin === DEV_PIN && !u.has_hash);
            if (allGood) {
                console.log(`\n🎉 All ${after.rowCount} users now have PIN '${DEV_PIN}' (no hash blocking)`);
            } else {
                console.log('\n⚠️ WARNING: Some users may still have issues');
            }

        } finally {
            client.release();
        }
    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        await pool.end();
    }
}

resetAllPinsToDev();
