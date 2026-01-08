
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function testQuery() {
    try {
        console.log('Testing history query...');

        // Emulating the query from history-v2.ts (AFTER FIX)
        const sql = `
            SELECT 
                s.id,
                s.terminal_id,
                t.name as terminal_name,
                s.user_id,
                u.name as user_name,
                s.opened_at,
                s.closed_at,
                s.opening_amount,
                s.closing_amount,
                s.cash_difference as difference,
                s.status,
                s.notes,
                s.authorized_by,
                au.name as authorized_by_name,
                t.location_id
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN users au ON s.authorized_by = au.id
            WHERE 1=1
            ORDER BY s.opened_at DESC LIMIT 5
        `;

        const res = await pool.query(sql);
        console.log('Query successful!');
        console.table(res.rows.map(r => ({ ...r, notes: r.notes?.substring(0, 20) })));
        process.exit(0);

    } catch (err) {
        console.error('❌ QUERY FAILED:', err);
        process.exit(1);
    }
}

testQuery();
