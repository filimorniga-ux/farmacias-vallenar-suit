
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkSchema() {
    const { query } = await import('../lib/db');
    try {
        const res = await query("SELECT to_regclass('public.quotes')");
        console.log('Exists?', res.rows[0]);
    } catch (e) { console.error(e); }
    process.exit(0);
}
checkSchema();
