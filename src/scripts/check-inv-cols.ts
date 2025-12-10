
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkCols() {
    const { query } = await import('../lib/db');
    try {
        const res = await query("SELECT * FROM inventory_batches LIMIT 1");
        console.log('Columns:', Object.keys(res.rows[0]));
    } catch (e) { console.error(e); }
    process.exit(0);
}
checkCols();
