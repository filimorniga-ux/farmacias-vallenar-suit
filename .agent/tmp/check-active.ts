import { Pool } from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });

const dbUrl = process.env.DATABASE_URL?.replace(':6543', ':5432')?.split('?')[0];
const pool = new Pool({ connectionString: dbUrl });

async function run() {
  try {
    console.log('--- OPEN TERMINALS ---');
    const terminals = await pool.query("SELECT id, name, status, current_cashier_id FROM terminals WHERE status = 'OPEN'");
    console.log(JSON.stringify(terminals.rows, null, 2));

    console.log('\n--- OPEN SESSIONS ---');
    const sessions = await pool.query("SELECT id, terminal_id, user_id, opened_at FROM cash_register_sessions WHERE closed_at IS NULL");
    console.log(JSON.stringify(sessions.rows, null, 2));

    if (sessions.rows.length > 0) {
        console.log('\n--- DETAILED CROSS-CHECK ---');
        for (const sess of sessions.rows) {
            console.log(`Checking Session ${sess.id} for Terminal ${sess.terminal_id}`);
            const t = await pool.query("SELECT status FROM terminals WHERE id = $1", [sess.terminal_id]);
            console.log(`Terminal Status in DB: ${t.rows[0]?.status}`);
        }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
