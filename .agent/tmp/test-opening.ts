import { openTerminalWithPinValidation } from '../../src/actions/terminals-v2';
import { Pool } from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });

const dbUrl = process.env.DATABASE_URL?.replace(':6543', ':5432')?.split('?')[0];
const pool = new Pool({ connectionString: dbUrl });

async function test() {
  console.log('--- TEST: openTerminalWithPinValidation ---');
  const terminalId = '8153d107-d024-4c52-8c22-564f0d06c937';
  const userId = '9cd19e60-6047-4c64-ab08-1f826330e727';
  const supervisorPin = '1213';
  const initialCash = 50000;

  try {
    const result = await openTerminalWithPinValidation(terminalId, userId, initialCash, supervisorPin);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('Success returned! Verifying DB...');
      const res = await pool.query('SELECT status, current_cashier_id FROM terminals WHERE id = $1', [terminalId]);
      console.log('DB Terminal State:', JSON.stringify(res.rows[0], null, 2));
      
      const sess = await pool.query('SELECT id, status, closed_at FROM cash_register_sessions WHERE id = $1', [result.sessionId]);
      console.log('DB Session State:', JSON.stringify(sess.rows[0], null, 2));
    }
  } catch (err) {
    console.error('CRITICAL ERROR:', err);
  } finally {
    await pool.end();
  }
}

test();
