import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function testFetch() {
    const locationId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6'; // Farmacia Vallenar Santiago
    console.log(`📡 Fetching terminals for location: ${locationId}`);

    try {
        // Detailed Telemetry Query - COPIED FROM src/actions/terminals.ts
        const result = await pool.query(`
            SELECT 
                t.id, 
                t.name, 
                t.location_id, 
                t.status, 
                t.current_cashier_id,
                t.allowed_users,
                u.name as cashier_name,
                s.opened_at,
                s.blind_counts
            FROM terminals t
            LEFT JOIN users u ON t.current_cashier_id = u.id
            LEFT JOIN cash_register_sessions s ON (s.terminal_id = t.id::text AND s.status = 'OPEN')
            WHERE t.location_id = $1::uuid
            ORDER BY t.name ASC
        `, [locationId]);

        console.log('--- RESULT ---');
        console.table(result.rows);

        if (result.rows.length > 0) {
            console.log(`✅ Found ${result.rows.length} terminals.`);
            // Verify mapping logic
            const terminals = result.rows.map((row: any) => ({
                id: row.id,
                name: row.name,
                location_id: row.location_id,
                status: row.status === 'OPEN' ? 'OPEN' : 'CLOSED',
                current_cashier_id: row.current_cashier_id,
                current_cashier_name: row.cashier_name,
                opened_at: row.opened_at ? new Date(row.opened_at).getTime() : undefined,
                blind_counts_count: row.blind_counts || 0,
                authorized_by_name: undefined,
                allowed_users: row.allowed_users || [] // Add this
            }));
            console.log('Mapped Terminals:', terminals);
        } else {
            console.log('❌ No terminals found.');
        }
    } catch (error) {
        console.error('🚨 CRITICAL ERROR calling query:', error);
    } finally {
        await pool.end();
    }
}

testFetch();
