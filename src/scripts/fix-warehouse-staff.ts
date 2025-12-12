
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

console.log('🔌 Connecting to DB to fix Warehouse Staff...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🔍 Identifying Warehouse Locations...');

        // 1. Find Warehouse Locations
        const whRes = await client.query(`
            SELECT id, name, type 
            FROM locations 
            WHERE type IN ('HQ', 'WAREHOUSE')
        `);

        const validLocIds = whRes.rows.map(r => r.id);
        const validLocNames = whRes.rows.map(r => r.name);

        console.log(`FOUND ${validLocIds.length} Warehouse Locations:`, validLocNames);

        if (validLocIds.length === 0) {
            console.log('⚠️ No warehouses found. Aborting.');
            return;
        }

        // 2. Update Users
        console.log('👷 Updating Staff Roles...');
        await client.query('BEGIN');

        // Logic: 
        // - Set role = 'WAREHOUSE'
        // - Set job_title based on name heuristic or default
        const updateQuery = `
            UPDATE users
            SET 
                role = 'WAREHOUSE',
                job_title = CASE 
                    WHEN name ILIKE '%Jefe%' OR name ILIKE '%Admin%' OR job_title ILIKE '%Jefe%' THEN 'Jefe de Bodega'
                    ELSE 'Asistente de Bodega'
                END
            WHERE assigned_location_id = ANY($1::uuid[])
            RETURNING id, name, role, job_title, assigned_location_id
        `;

        const res = await client.query(updateQuery, [validLocIds]);

        await client.query('COMMIT');

        console.log(`✅ Personal de Bodega Corregido: ${res.rowCount || 0} usuarios actualizados.`);

        // Log details
        if ((res.rowCount || 0) > 0) {
            console.table(res.rows.map(r => ({
                Name: r.name,
                NewRole: r.role,
                NewTitle: r.job_title
            })));
        }

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error updating staff:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
