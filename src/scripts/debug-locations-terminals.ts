import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log('🔍 DEBUGGING LOCATIONS & TERMINALS MAPPING');
    try {
        // 1. Get ALL Locations (Active & Inactive)
        const locRes = await pool.query(`
            SELECT id, name, type, is_active 
            FROM locations 
            ORDER BY name ASC
        `);

        console.log(`\n📍 FOUND ${locRes.rows.length} LOCATIONS:`);
        console.table(locRes.rows);

        // 2. Get ALL Terminals with their Location IDs
        const termRes = await pool.query(`
            SELECT t.id, t.name, t.location_id, t.status, t.is_active, l.name as location_name
            FROM terminals t
            LEFT JOIN locations l ON t.location_id = l.id
            ORDER BY t.created_at DESC
        `);

        console.log(`\n🖥️ FOUND ${termRes.rows.length} TERMINALS:`);
        if (termRes.rows.length > 0) {
            console.table(termRes.rows);
        } else {
            console.log('⚠️ NO TERMINALS FOUND IN DB');
        }

        // 3. Highlight potential "Santiago" duplicates
        const santiagoLocs = locRes.rows.filter(l => l.name.toLowerCase().includes('santiago'));
        if (santiagoLocs.length > 1) {
            console.error('\n🚨 CRITICAL: MULTIPLE SANTIAGO LOCATIONS DETECTED!');
            console.table(santiagoLocs);
        }

    } catch (e) {
        console.error('❌ ERROR:', e);
    } finally {
        await pool.end();
    }
}
run();
