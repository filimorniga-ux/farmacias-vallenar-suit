import { Pool } from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });
const dbUrl = process.env.DATABASE_URL?.replace(':6543', ':5432')?.split('?')[0];
const pool = new Pool({ connectionString: dbUrl });

async function check() {
  const res = await pool.query(`
    SELECT crs.id, crs.terminal_id, t.status as term_status, crs.user_id, u.name, crs.opened_at 
    FROM cash_register_sessions crs
    JOIN terminals t ON crs.terminal_id::uuid = t.id::uuid
    LEFT JOIN users u ON u.id::uuid = crs.user_id::uuid
    WHERE crs.closed_at IS NULL AND t.status != 'OPEN'
  `);
  console.log('--- ZOMBIE SESSIONS (closed_at IS NULL but Terminal is NOT OPEN) ---');
  console.log(JSON.stringify(res.rows, null, 2));

  const autoClosedRes = await pool.query(`
    SELECT id, terminal_id, status, closed_at FROM cash_register_sessions
    WHERE closed_at IS NULL
  `);
  console.log('\\n--- ALL SESSIONS WITH closed_at IS NULL ---');
  console.log(JSON.stringify(autoClosedRes.rows, null, 2));

  await pool.end();
}
check().catch(console.error);
