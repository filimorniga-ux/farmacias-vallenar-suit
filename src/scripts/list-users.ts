
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function listUsers() {
    const { query } = await import('../lib/db');
    try {
        const res = await query("SELECT name, role, assigned_location_id FROM users");
        console.table(res.rows);
    } catch (e) { console.error(e); }
    process.exit(0);
}
listUsers();
