
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}
const envLocal = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function simulateCall() {
    const client = await pool.connect();
    try {
        const branchId = 'bd7ddf7a-fac6-42f5-897d-bae8dfb3adf6';
        const terminalId = 'a897fab7-61a8-48a3-b7bb-d869f7078086'; // Caja 1 stgo

        console.log('--- Simulating Call ---');

        // 1. Get a user
        const userRes = await client.query('SELECT id FROM users LIMIT 1');
        const userId = userRes.rows[0]?.id;
        if (!userId) throw new Error('No users found');
        console.log('Using User:', userId);

        await client.query('BEGIN');

        // 2. Select Next Ticket
        const res = await client.query(`
            SELECT * FROM queue_tickets
            WHERE branch_id = $1 AND status = 'WAITING'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `, [branchId]);

        if (res.rowCount === 0) {
            console.log('No waiting tickets.');
            await client.query('ROLLBACK');
            return;
        }

        const ticket = res.rows[0];
        console.log(`Found Ticket: ${ticket.code} (${ticket.id})`);

        // 3. Update
        await client.query(`
            UPDATE queue_tickets
            SET status = 'CALLED', called_at = NOW(), called_by = $1, terminal_id = $2
            WHERE id = $3
        `, [userId, terminalId, ticket.id]);

        console.log('Updated to CALLED');

        await client.query('COMMIT');
        console.log('COMMIT SUCCESS');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error:', e);
    } finally {
        client.release();
        pool.end();
    }
}

simulateCall();
