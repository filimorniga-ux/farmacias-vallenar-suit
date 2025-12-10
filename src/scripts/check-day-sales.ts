
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkTodaySales() {
    const dbModule = await import('../lib/db');
    const query = dbModule.query;

    console.log('📅 Checking Sales for TODAY (2025-12-10)...');

    // Adjust logic to match expected simulation date if needed, but Metadata says today is 2025-12-10.
    const startOfDay = '2025-12-10 00:00:00';
    const endOfDay = '2025-12-10 23:59:59';

    try {
        const res = await query(`
            SELECT COUNT(*) as count, SUM(total_amount) as total 
            FROM sales 
            WHERE timestamp >= $1 AND timestamp <= $2
        `, [startOfDay, endOfDay]);

        console.log('📊 Resultados del Día:', res.rows[0]);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

checkTodaySales();
