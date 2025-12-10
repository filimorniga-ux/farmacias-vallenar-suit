
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkDailySales() {
    const { query } = await import('../lib/db');
    try {
        console.log('📅 Checking Daily Sales Breakdown (UTC)...');
        const res = await query(`
            SELECT to_char(timestamp, 'YYYY-MM-DD') as day, SUM(total_amount) as total, COUNT(*) as count 
            FROM sales 
            GROUP BY day 
            ORDER BY day DESC 
            LIMIT 5
        `);
        console.table(res.rows);
    } catch (e) { console.error(e); }
    process.exit(0);
}
checkDailySales();
