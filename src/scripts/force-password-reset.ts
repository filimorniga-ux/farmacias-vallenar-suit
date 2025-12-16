
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env.local' });
if (!process.env.DATABASE_URL) dotenv.config({ path: '.env' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log("=== FORCE PASSWORD RESET (Demo Users) ===");

    try {
        const NEW_PIN = "1213";
        const hash = await bcrypt.hash(NEW_PIN, 10);

        console.log(`Hashing new password '${NEW_PIN}'...`);

        // Note: The application uses 'access_pin' column for storing the password hash for these users.
        const res = await pool.query(`
            UPDATE users 
            SET access_pin = $1 
            WHERE email LIKE '%@demo.cl'
        `, [hash]);

        console.log(`✅ Success: Updated password/pin for ${res.rowCount} users.`);

    } catch (e) {
        console.error("❌ Error resetting passwords:", e);
    } finally {
        await pool.end();
    }
}

run();
