
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

console.log('🔌 Connecting to DB to find Prat Admin...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        // 1. Get Location ID for "Prat"
        const locRes = await client.query("SELECT id, name FROM locations WHERE name ILIKE '%Prat%' LIMIT 1");
        if (locRes.rowCount === 0) {
            console.error('❌ Sucursal Prat no encontrada');
            return;
        }
        const prat = locRes.rows[0];
        console.log(`📍 Found Location: ${prat.name} (${prat.id})`);

        // 2. Find Admin/Manager
        const userRes = await client.query(`
            SELECT name, rut, role, job_title 
            FROM users 
            WHERE assigned_location_id = $1 
            AND role IN ('MANAGER', 'ADMIN', 'Admin', 'Manager')
        `, [prat.id]);

        if (userRes.rowCount === 0) {
            console.log('⚠️ No dedicated Admin found for Prat. Checking any user...');
            const anyUser = await client.query("SELECT name, rut, role, job_title FROM users WHERE assigned_location_id = $1 LIMIT 3", [prat.id]);
            console.table(anyUser.rows);
            return;
        }

        console.log('✅ Admin(s) Found for Prat:');
        console.table(userRes.rows.map(u => ({
            Name: u.name,
            RUT: u.rut,
            Role: u.role,
            Title: u.job_title,
            DefaultPIN: '1213 (Try this)'
        })));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
