
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function query(text: string, params: any[] = []) {
    return pool.query(text, params);
}

async function diagnose() {
    try {
        console.log('🔍 Searching for FORCE CLOSED sessions on Jan 29, 2026...');

        // 1. Find the target session(s)
        const targetSessions = await query(`
            SELECT s.id, s.terminal_id, t.name as terminal_name, s.user_id, s.opened_at, s.closed_at, s.status, s.notes
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.status = 'CLOSED_FORCE'
            -- Removed date filter to see all recent force closed, to be safe
            ORDER BY s.closed_at DESC
            LIMIT 5
        `);

        console.log(`Found ${targetSessions.rows.length} recent force-closed sessions.`);

        for (const session of targetSessions.rows) {
            console.log('\n------------------------------------------------');
            console.log(`SESSION: ${session.id}`);
            console.log(`Terminal: ${session.terminal_name} (${session.terminal_id})`);
            console.log(`Closed At: ${session.closed_at}`);
            console.log(`Status: ${session.status}`);
            console.log(`Notes: ${session.notes}`);

            // 2. Check for active session on this terminal
            const activeSession = await query(`
                SELECT id, status, opened_at 
                FROM cash_register_sessions 
                WHERE terminal_id = $1 
                AND status = 'OPEN'
            `, [session.terminal_id]);

            if (activeSession.rows.length > 0) {
                console.log(`⚠️ CONFLICT: Found ${activeSession.rows.length} OPEN sessions for this terminal!`);
                activeSession.rows.forEach(s => console.log(`   - ID: ${s.id} Opened: ${s.opened_at}`));
            } else {
                console.log(`✅ No active session conflict found for terminal.`);
            }

            // 3. Check terminal status
            const terminal = await query(`SELECT status, current_cashier_id FROM terminals WHERE id = $1`, [session.terminal_id]);
            const term = terminal.rows[0];
            console.log(`Current Terminal Status: ${term?.status}`);
            console.log(`Current Terminal Cashier: ${term?.current_cashier_id}`);
        }

    } catch (e: any) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

diagnose();
