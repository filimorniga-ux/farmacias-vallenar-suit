
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB to fix Staff Locations...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        // 1. Get Default Location (Centro)
        const locRes = await client.query("SELECT id FROM locations WHERE name LIKE '%Centro%' LIMIT 1");
        if (locRes.rowCount === 0) {
            console.error('❌ Sucursal Centro no encontrada. Cannot default.');
            return;
        }
        const defaultLocId = locRes.rows[0].id;

        // 2. Find Users with NULL assigned_location_id
        console.log('🔍 Scanning for unassigned staff...');
        const updateRes = await client.query(`
            UPDATE users 
            SET assigned_location_id = $1, updated_at = NOW()
            WHERE assigned_location_id IS NULL
            RETURNING id, name, role
        `, [defaultLocId]);

        if (updateRes.rowCount === 0) {
            console.log('✅ All staff have valid locations. No changes needed.');
        } else {
            console.log(`✅ Fixed ${updateRes.rowCount} users (Assigned to Centro):`);
            console.table(updateRes.rows);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
