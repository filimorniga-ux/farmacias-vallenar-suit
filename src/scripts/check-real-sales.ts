
import dotenv from 'dotenv';
import path from 'path';

// Fix: Load .env explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

async function main() {
    console.log('💰 Verificando Ventas Reales en DB...');

    const dbModule = await import('../lib/db');
    const { query } = dbModule;

    try {
        const res = await query('SELECT SUM(total_amount) as total, COUNT(*) as count FROM sales');
        const row = res.rows[0];

        console.log('------------------------------------------------');
        console.log(`🧾 Total Transacciones: ${row.count}`);
        console.log(`💵 Monto Total (SUM): ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(row.total || 0)}`);
        console.log('------------------------------------------------');

        // Also check by location/date to see where the money is
        const dateRes = await query(`
            SELECT 
                to_char(timestamp, 'YYYY-MM') as month, 
                SUM(total_amount) as total 
            FROM sales 
            GROUP BY month 
            ORDER BY month DESC
        `);
        console.table(dateRes.rows);

    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();
