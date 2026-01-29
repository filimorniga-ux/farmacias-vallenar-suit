import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB to RESET PINs...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const hashPin = (pin: string) => {
    return crypto.createHash('sha256').update(pin).digest('hex');
};

async function main() {
    const client = await pool.connect();
    try {
        const TARGET_PIN = '1213';
        const TARGET_HASH = hashPin(TARGET_PIN);

        console.log(`🔐 Resetting ALL users to PIN: ${TARGET_PIN}`);

        const res = await client.query(`
            UPDATE users 
            SET access_pin = $1, pin_hash = $2
            WHERE is_active = true OR status = 'ACTIVE'
        `, [TARGET_PIN, TARGET_HASH]);

        console.log(`✅ Updated ${res.rowCount} users.`);

    } catch (e) {
        console.error('❌ Error updating PINs:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
