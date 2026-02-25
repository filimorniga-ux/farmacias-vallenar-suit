import { Pool } from 'pg';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const dbUrl = process.env.DATABASE_URL?.replace(':6543', ':5432')?.split('?')[0];
const pool = new Pool({ connectionString: dbUrl });

async function check() {
  const res = await pool.query(`
    SELECT t.id as terminal_id, t.status, t.current_cashier_id,
           u.name as cashier_name,
           crs.id as session_id, crs.status as session_status, crs.opened_at, crs.closed_at
    FROM terminals t
    LEFT JOIN users u ON u.id = t.current_cashier_id
    LEFT JOIN cash_register_sessions crs ON crs.terminal_id = t.id AND crs.closed_at IS NULL
  `);
  console.log('--- TERMINALS & ACTIVE SESSIONS ---');
  console.log(JSON.stringify(res.rows, null, 2));

  const allSessionsRes = await pool.query(`
    SELECT id as session_id, terminal_id, user_id, status as session_status, opened_at, closed_at, notes
    FROM cash_register_sessions
    ORDER BY opened_at DESC
    LIMIT 5
  `);
  console.log('\\n--- LAST 5 SESSIONS ---');
  console.log(JSON.stringify(allSessionsRes.rows, null, 2));

  await pool.end();
}

check().catch(console.error);
