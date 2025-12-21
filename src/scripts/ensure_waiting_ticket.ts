import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });

async function ensureWaitingTicket() {
    const { Pool } = await import('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });

    try {
        // Check for waiting tickets
        const res = await pool.query("SELECT * FROM queue_tickets WHERE status = 'WAITING'");
        console.log(`Found ${res.rowCount} waiting tickets.`);

        if (res.rowCount === 0) {
            console.log('Creating a dummy WAITING ticket...');
            // We need a valid branch_id. Let's find one or use a dummy if we can't find one.
            // Usually we have branches or locations. 
            // Let's assume there's at least one location or we can insert a dummy ID if foreign keys allow, 
            // but earlier schema showed branch_id is NOT NULL and no FK constraint was explicitly shown in check columns (it showed no constraints other than PK).
            // But good practice is to check.

            // Let's just generate a random UUID for branch_id since no FK was seen in check_queue_columns output.
            // Actually check_queue_columns output only showed PK constraint on id.

            await pool.query(`
                INSERT INTO queue_tickets (branch_id, rut, type, code, status)
                VALUES (gen_random_uuid(), '12345678-9', 'GENERAL', 'G999', 'WAITING')
            `);
            console.log('✅ Created dummy ticket G999.');
        } else {
            console.log('Tickets available:', res.rows.map(r => r.code).join(', '));
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

ensureWaitingTicket();
