
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// 1. Load env vars manually
const envPath = path.resolve(process.cwd(), '.env');
console.log('Loading env from:', envPath);

if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value && !process.env[key.trim()]) {
            process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
        }
    });
}

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ POSTGRES_URL or DATABASE_URL not found in environment');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🔌 Connected to DB');
        console.log('Adding allowed_modules column to users table...');

        await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] DEFAULT NULL;
    `);

        console.log('✅ Column allowed_modules added successfully.');
    } catch (err) {
        console.error('❌ Error adding column:', err);
        process.exit(1);
    } finally {
        client.release();
        pool.end();
        process.exit(0);
    }
}

main();
