
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function checkActiveSales() {
    try {
        // 1. Find the active Open session that has sales
        console.log('🔍 Searching for OPEN sessions with sales...');

        const sessions = await pool.query(`
            SELECT s.id, s.opened_at, s.user_id, t.name as terminal_name,
                   (SELECT COUNT(*) FROM sales WHERE session_id = s.id) as sales_count
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.status = 'OPEN'
        `);

        const blockingSessions = sessions.rows.filter(r => r.sales_count > 0);

        if (blockingSessions.length === 0) {
            console.log('✅ No OPEN sessions with sales found. (Maybe the user already closed it?)');
        } else {
            console.log(`⚠️ Found ${blockingSessions.length} OPEN sessions with sales:`);
            for (const sess of blockingSessions) {
                console.log(`\n📦 Session ID: ${sess.id}`);
                console.log(`   Terminal: ${sess.terminal_name}`);
                console.log(`   Opened: ${new Date(sess.opened_at).toLocaleString()}`);
                console.log(`   Sales Count: ${sess.sales_count}`);

                // Details of sales
                const sales = await pool.query(`
                    SELECT id, total_amount, payment_method, created_at 
                    FROM sales 
                    WHERE session_id = $1 
                    LIMIT 5
                `, [sess.id]);
                console.table(sales.rows);
            }
        }

        process.exit(0);
    } catch (err: any) {
        console.error('Global Error', err.message);
        process.exit(1);
    }
}

checkActiveSales();
