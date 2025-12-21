
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function rescueTerminals() {
    console.log('🚑 Starting Terminal Rescue...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get all Active Stores
        const storesRes = await client.query(`SELECT id, name FROM locations WHERE type = 'STORE' AND is_active = true`);
        const stores = storesRes.rows;

        console.log(`📍 Found ${stores.length} active stores/locations.`);

        for (const store of stores) {
            // 2. Check for existing terminals
            const termRes = await client.query(`SELECT count(*) as count FROM terminals WHERE location_id = $1 AND status != 'DELETED'`, [store.id]);
            const termCount = parseInt(termRes.rows[0].count);

            if (termCount === 0) {
                console.log(`⚠️  Store '${store.name}' has 0 terminals. Creating default terminals...`);

                const t1Id = uuidv4();
                const t2Id = uuidv4();

                await client.query(`
                    INSERT INTO terminals (id, location_id, name, status, config, created_at)
                    VALUES 
                    ($1, $3, 'Caja 1', 'CLOSED', '{}', NOW()),
                    ($2, $3, 'Caja 2', 'CLOSED', '{}', NOW())
                `, [t1Id, t2Id, store.id]);

                console.log(`   ✅ Created 'Caja 1' (${t1Id}) and 'Caja 2' (${t2Id}) for ${store.name}`);
            } else {
                console.log(`   ✅ Store '${store.name}' already has ${termCount} terminals. Skipping.`);
            }
        }

        await client.query('COMMIT');
        console.log('✅ Rescue Complete! All locations should now have terminals.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Rescue Failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

rescueTerminals();
