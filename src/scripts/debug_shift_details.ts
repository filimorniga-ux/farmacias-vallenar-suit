
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function runDiagnostics() {
    try {
        console.log('--- SALES SCHEMA ---');
        const salesCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'sales'
        `);
        console.table(salesCols.rows);

        console.log('\n--- SALE_PAYMENTS SCHEMA ---');
        const payCols = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'sale_payments'
        `);
        console.table(payCols.rows);

        console.log('\n--- RECENT SESSIONS ---');
        const sessions = await pool.query(`SELECT id, status FROM cash_register_sessions ORDER BY opened_at DESC LIMIT 3`);
        console.table(sessions.rows);

        if (sessions.rows.length > 0) {
            const testId = sessions.rows[0].id;
            console.log(`\n--- TESTING QUERY FOR SESSION: ${testId} ---`);

            // Replicate the failing query (likely the Sales one)
            try {
                const salesRes = await pool.query(`
                    SELECT 
                        sp.payment_method, 
                        SUM(sp.amount) as total_amount,
                        COUNT(DISTINCT s.id) as tx_count
                    FROM sales s
                    JOIN sale_payments sp ON s.id = sp.sale_id
                    WHERE s.session_id = $1::uuid
                    GROUP BY sp.payment_method
                `, [testId]);
                console.log('✅ Sales Query OK');
            } catch (e: any) {
                console.error('❌ Sales Query FAILED:', e.message);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

runDiagnostics();
