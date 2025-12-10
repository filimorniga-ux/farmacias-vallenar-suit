
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkTimezone() {
    const { query } = await import('../lib/db');
    try {
        const res = await query("SELECT NOW(), CURRENT_TIME, CURRENT_SETTING('TIMEZONE')");
        console.log('🕒 DB TIME:', res.rows[0]);
    } catch (e) { console.error(e); }
    process.exit(0);
}
checkTimezone();
