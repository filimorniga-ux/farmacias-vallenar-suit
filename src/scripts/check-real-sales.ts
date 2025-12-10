
import dotenv from 'dotenv';
import path from 'path';

// Fix: Load .env explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkRealSales() {
    const dbModule = await import('../lib/db');
    const query = dbModule.query;

    console.log('💰 Validating Real Sales vs UI...');

    try {
        // 1. Total Global
        const totalRes = await query("SELECT SUM(total_amount) as total FROM sales");
        const total = totalRes.rows[0]?.total || 0;
        console.log(`💵 TOTAL REAL EN DB: $${Number(total).toLocaleString('es-CL')}`);

        // 2. Breakdown by Month (to see if Nov/Dec has data)
        const monthRes = await query(`
            SELECT to_char(timestamp, 'YYYY-MM') as month, SUM(total_amount) as total 
            FROM sales 
            GROUP BY month 
            ORDER BY month DESC
        `);
        console.log('📅 Breakdown por Mes:', monthRes.rows);

        // 3. Last 5 Sales
        const lastSales = await query("SELECT id, total_amount, timestamp FROM sales ORDER BY timestamp DESC LIMIT 5");
        console.log('📝 Últimas 5 Ventas:', lastSales.rows);

    } catch (e) {
        console.error('❌ Error querying DB:', e);
    }

    process.exit(0);
}

checkRealSales();
