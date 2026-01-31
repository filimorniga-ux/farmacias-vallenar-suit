
import { pool } from './src/lib/db';

async function listLatestUsers() {
    try {
        const res = await pool.query(`
            SELECT id, name, rut, role, created_at 
            FROM users 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        console.log('Latest 5 users:');
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

listLatestUsers();
