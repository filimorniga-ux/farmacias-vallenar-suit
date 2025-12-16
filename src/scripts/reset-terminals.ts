import { Pool } from 'pg';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log('🧨 STARTING HARD RESET OF TERMINALS 🧨');

    try {
        // 1. PURGE: Delete all terminals
        const deleteRes = await pool.query('DELETE FROM terminals');
        console.log(`🗑️  DELETED: ${deleteRes.rowCount} corrupted/old terminals.`);

        // 2. FETCH: Get active locations
        const locRes = await pool.query('SELECT id, name FROM locations WHERE is_active = true');
        const locations = locRes.rows;

        if (locations.length === 0) {
            console.error('⚠️ No active locations found to seed terminals.');
            return;
        }

        console.log(`📍 Found ${locations.length} active locations. seeding terminals...`);

        // 3. RESEED: Create Caja 1 & Caja 2 for each
        let createdCount = 0;

        for (const loc of locations) {
            console.log(`\nProcessing: ${loc.name} (${loc.id})`);

            const terminalsToCreate = ['Caja 1', 'Caja 2'];

            for (const termName of terminalsToCreate) {
                const id = uuidv4();

                await pool.query(`
                    INSERT INTO terminals (id, location_id, name, status, config, created_at, is_active, allowed_users)
                    VALUES ($1, $2, $3, 'CLOSED', '{}', NOW(), true, '{}')
                `, [id, loc.id, termName]);

                console.log(`  ✅ Created: ${termName} [${id}]`);
                createdCount++;
            }
        }

        console.log('\n----------------------------------------');
        console.log(`✅ SUCCESS: Created ${createdCount} standard terminals across ${locations.length} locations.`);

    } catch (e) {
        console.error('❌ FATAL ERROR During Reset:', e);
    } finally {
        await pool.end();
    }
}

run();
