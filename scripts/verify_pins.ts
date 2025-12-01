import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
console.log('DEBUG: DATABASE_URL is:', process.env.DATABASE_URL ? 'SET' : 'UNSET');
console.log('DEBUG: Connection String:', process.env.DATABASE_URL); // Temporarily log full string to debug format
// import { pool } from '../src/lib/db'; // Removed static import

async function checkPins() {
    // Dynamic import to ensure env vars are loaded first
    const { pool } = await import('../src/lib/db');

    try {
        console.log('🔍 Checking users in DB...');
        const res = await pool.query('SELECT name, role, access_pin FROM users');
        console.table(res.rows);

        const needsUpdate = res.rows.some(u => u.access_pin !== '1213');
        if (needsUpdate) {
            console.log('⚠️ Some users do NOT have PIN 1213. Updating...');
            await pool.query("UPDATE users SET access_pin = '1213'");
            console.log('✅ All users updated to PIN 1213');
        } else {
            console.log('✅ All users already have PIN 1213');
        }
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

checkPins();
