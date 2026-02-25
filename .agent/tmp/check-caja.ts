import { pool } from './src/lib/db';

async function check() {
    const res = await pool.query(`
    SELECT t.id as terminal_id, t.status, t.current_cashier_id,
           crs.id as session_id, crs.status as session_status, crs.closed_at
    FROM terminals t
    LEFT JOIN cash_register_sessions crs ON crs.terminal_id = t.id AND crs.closed_at IS NULL
  `);
    console.log('Terminals & Active Sessions:', JSON.stringify(res.rows, null, 2));

    const allSessionsRes = await pool.query(`
    SELECT id as session_id, terminal_id, status as session_status, opened_at, closed_at
    FROM cash_register_sessions
    ORDER BY opened_at DESC
    LIMIT 5
  `);
    console.log('Last 5 Sessions:', JSON.stringify(allSessionsRes.rows, null, 2));

    pool.end();
}

check().catch(console.error);
