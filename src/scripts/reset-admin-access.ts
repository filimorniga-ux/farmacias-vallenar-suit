
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB to Reset Access...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

const hashPin = (pin: string) => {
    return crypto.createHash('sha256').update(pin).digest('hex');
};

async function main() {
    const client = await pool.connect();
    try {
        console.log('🔓 Unlocking accounts...');

        // 1. Clear Lockouts
        await client.query("DELETE FROM login_attempts");
        console.log('✅ Login Attempts Cleared.');

        // 2. Find Admin User
        console.log('🔍 Searching for Admin User...');
        // Priority: 'Admin Centro', then any 'MANAGER'
        let userRes = await client.query("SELECT * FROM users WHERE name ILIKE '%Admin Centro%' LIMIT 1");

        if (userRes.rowCount === 0) {
            console.log('⚠️ "Admin Centro" not found by name. Searching for any MANAGER...');
            userRes = await client.query("SELECT * FROM users WHERE role = 'MANAGER' LIMIT 1");
        }

        if (userRes.rowCount === 0) {
            console.error('❌ CRITICAL: No Admin user found in DB.');
            return;
        }

        const user = userRes.rows[0];
        console.log(`👤 Found Target User: ${user.name} (${user.rut})`);

        // 3. Reset PIN
        const newPin = '1213';
        const newHash = hashPin(newPin);

        await client.query("UPDATE users SET pin_hash = $1 WHERE id = $2", [newHash, user.id]);
        console.log(`✅ PIN Reset to '${newPin}' for user ${user.name}.`);

        // 4. Reveal Details

        // Fetch Location Name
        let locName = 'Unknown';
        if (user.assigned_location_id) {
            const locRes = await client.query("SELECT name FROM locations WHERE id = $1", [user.assigned_location_id]);
            if ((locRes.rowCount || 0) > 0) locName = locRes.rows[0].name;
        }

        console.log('\n--- 🔑 CREDENTIALS REVEALED ---');
        console.log(`📛 Name:            ${user.name}`);
        console.log(`🆔 RUT (Exact):     ${user.rut}`);
        console.log(`📍 Assigned Branch: ${locName}`);
        console.log(`🔢 PIN:             ${newPin}`);
        console.log('-------------------------------');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
