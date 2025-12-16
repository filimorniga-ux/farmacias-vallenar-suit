
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function testFetch() {
    const locationId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6'; // Farmacia Vallenar Santiago
    console.log(`📡 Fetching AVAILABLE terminals for POS (Shift Opening) for location: ${locationId}`);

    try {
        // Query from getAvailableTerminalsForShift with fixes applied
        const result = await pool.query(`
            SELECT * FROM terminals 
            WHERE location_id = $1::uuid 
              AND (is_active = TRUE OR is_active IS NULL)
              AND (deleted_at IS NULL)
              AND status != 'DELETED'
              AND id::text NOT IN (
                  SELECT terminal_id FROM cash_register_sessions WHERE closed_at IS NULL
              )
            ORDER BY name ASC
        `, [locationId]);

        console.log('--- RESULT ---');
        console.table(result.rows);

        if (result.rows.length > 0) {
            console.log(`✅ Found ${result.rows.length} available terminals.`);
        } else {
            console.log('❌ No terminals found. (All closed? Or bug?)');
        }
    } catch (error) {
        console.error('🚨 CRITICAL ERROR calling query:', error);
    } finally {
        await pool.end();
    }
}

testFetch();
