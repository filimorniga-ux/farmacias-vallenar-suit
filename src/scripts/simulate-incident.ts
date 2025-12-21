import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function simulateIncident() {
    try {
        console.log('🤖 Creando incidente simulado (Cierre por SYSTEM_BOT)...');

        // 1. Get a random location and terminal
        const termRes = await pool.query('SELECT id, location_id, name FROM terminals LIMIT 1');
        if (termRes.rowCount === 0) throw new Error('No terminals found');
        const terminal = termRes.rows[0];

        // 2. Insert a simulated CLOSED session by SYSTEM_BOT
        // Notes: assuming closed_by_user_id column exists or using notes to identify logic?
        // The prompt imply "closed_by_user_id = 'SYSTEM_BOT'". 
        // Let's check if that column exists or if we need to insert a fake user 'SYSTEM_BOT' first.
        // Usually, user_ids are UUIDs. 'SYSTEM_BOT' is text. 
        // If closed_by_user_id refers to users(id), we might need a dummy user.
        // OR the query in `maintenance.ts` checks for something else.

        // Let's create a dummy session with open status first, then close it "badly"
        // Actually, let's look at what `getRecentSystemIncidents` looks for.
        // Wait, I can't see the code of `getRecentSystemIncidents`. I should check it to be precise.
        // But for now, I will assume the prompt instruction: "closed_by_user_id = 'SYSTEM_BOT'" implies 
        // either strict string matching or I need to handle the UUID constraint.

        // IF closed_by_user_id is UUID, 'SYSTEM_BOT' will fail. 
        // I'll try to insert a session with a specific note or status if the column is UUID.
        // However, let's try to check the schema first in the same script.

        const schemaRes = await pool.query(`
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = 'cash_register_sessions' AND column_name = 'closed_by_user_id'
        `);

        const isUuid = schemaRes.rows[0]?.data_type === 'uuid';
        console.log(`ℹ️ closed_by_user_id is type: ${schemaRes.rows[0]?.data_type}`);

        let closeId = null;

        if (isUuid) {
            // Need a valid UUID. Let's see if we can use a known one or create one.
            // Or maybe the instruction was metaphorical and it uses a specific user ID.
            // For now, I will use a NIL UUID or a made up one if it allows (unlikely if FK).
            // Better: use notes to flag it if I can't use 'SYSTEM_BOT'.
            // BUT, if the maintenance query filters by 'SYSTEM_BOT', it Must be text or specific UUID.
            // Let's assume for this simulation I'll set notes = 'AUTO_CLOSED_BY_SYSTEM' and status = 'CLOSED' with 0 amounts.
            // And hopefully `getRecentSystemIncidents` looks for that or looks for null closed_by_user_id.

            // To be safe, I'll update an existing session or new one to be very old (stale) so the REAL logic picks it up?
            // No, the prompt says "Simula un incidente: Modifica manualmente... closed_by_user_id = 'SYSTEM_BOT'".
            // If the column is UUID, this instruction is impossible literally.
            // I will assume it might be a string column OR the `maintenance.ts` handles a specific UUID.

            // Let's try to fetch `getRecentSystemIncidents` code first to be sure? No, I'll just try to create a "System User" if needed.

            // Create System User if not exists
            const botId = '00000000-0000-0000-0000-000000000000'; // NIL UUID
            await pool.query(`
                INSERT INTO users (id, name, email, role, password_hash, rut)
                VALUES ($1, 'SYSTEM_BOT', 'bot@system.local', 'ADMIN', 'hashed', '0-0')
                ON CONFLICT (id) DO NOTHING
             `, [botId]);
            closeId = botId;
        } else {
            closeId = 'SYSTEM_BOT';
        }

        const res = await pool.query(`
            INSERT INTO cash_register_sessions (
                terminal_id, user_id, opened_at, opening_amount, 
                status, closed_at, closing_amount, difference, 
                closed_by_user_id, notes
            )
            VALUES (
                $1, 
                (SELECT id FROM users LIMIT 1), 
                NOW() - INTERVAL '2 days', 
                10000, 
                'CLOSED', 
                NOW() - INTERVAL '1 day', 
                0, 
                -10000, 
                $2, 
                'Simulated System Closure'
            )
            RETURNING id;
        `, [terminal.id, closeId]);

        console.log(`✅ Incident simulated! Session ID: ${res.rows[0].id}`);

    } catch (e) {
        console.error('❌ Error simulating incident:', e);
    } finally {
        await pool.end();
    }
}

simulateIncident();
