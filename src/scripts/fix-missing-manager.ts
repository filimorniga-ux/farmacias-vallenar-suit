import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const { Pool } = pg;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

const hashPin = (pin: string) => {
    return crypto.createHash('sha256').update(pin).digest('hex');
};

async function main() {
    console.log('🔧 Restoring Gerente General...');
    const client = await pool.connect();

    try {
        // 1. Get Location (Centro)
        const locRes = await client.query("SELECT id FROM locations WHERE name = 'Farmacia Vallenar Centro' LIMIT 1");
        if (locRes.rows.length === 0) throw new Error("Location 'Farmacia Vallenar Centro' not found");
        const locId = locRes.rows[0].id;

        // 2. Check if already exists (by name)
        const check = await client.query("SELECT id FROM users WHERE name = 'Gerente General'");
        if (check.rows.length > 0) {
            console.log('⚠️ User "Gerente General" already exists. Updating Role/PIN...');
            await client.query(`
                UPDATE users 
                SET role = 'GERENTE_GENERAL', access_pin = '1213', pin_hash = $1, status = 'ACTIVE', assigned_location_id = $2
                WHERE name = 'Gerente General'
            `, [hashPin('1213'), locId]);
            console.log('✅ Updated "Gerente General"');
            return;
        }

        // 3. Insert User
        const id = uuidv4();
        const pin = '1213';
        const hashedPassword = hashPin(pin);

        // RUT for Manager
        const rut = '10500100-5'; // Dummy RUT for Manager

        await client.query(`
            INSERT INTO users(
                id, rut, name, role, access_pin, pin_hash, status,
                assigned_location_id, job_title, base_salary
            ) VALUES($1, $2, 'Gerente General', 'GERENTE_GENERAL', $3, $4, 'ACTIVE', $5, 'GERENTE', 2500000)
        `, [id, rut, pin, hashedPassword, locId]);

        console.log(`✅ Created "Gerente General" (ID: ${id}) assigned to Farmacia Vallenar Centro`);

    } catch (e) {
        console.error('❌ Failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
