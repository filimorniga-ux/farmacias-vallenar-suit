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

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    console.log('🔒 Starting Security Schema Update...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Create password_resets table
        console.log('Creating password_resets table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                email VARCHAR(255) NOT NULL,
                token VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        // Index for faster token lookup
        await client.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);`);


        // 2. Add columns to users table
        console.log('Updating users table...');

        // Email (Unique)
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);`);
        await client.query(`ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);`); // Will fail if duplicates, but handled below

        // Password (Hash)
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);`);

        // 3. Migrate Existing Users (Seed dummy emails)
        console.log('Seeding dummy emails for existing users...');
        const users = await client.query(`SELECT id, rut, name FROM users WHERE email IS NULL`);

        for (const user of users.rows) {
            // Generate dummy email from RUT or Name
            // Format: rut_without_dv@farmaciasvallenar.cl
            const rutClean = user.rut.replace(/[^0-9kK]/g, '').slice(0, -1);
            const dummyEmail = `${rutClean}@farmaciasvallenar.cl`;

            console.log(`Updating user ${user.name} -> ${dummyEmail}`);

            // Initial password same as PIN (hashed) or a default '123456'
            // For now, we leave password null or set a default if needed. 
            // We'll assume they use PIN for POS but might need password for Admin.
            // Let's set a default hashed password for testing if needed later.

            try {
                await client.query(`UPDATE users SET email = $1 WHERE id = $2`, [dummyEmail, user.id]);
            } catch (e) {
                console.warn(`Could not set email for ${user.name}:`, e);
            }
        }

        await client.query('COMMIT');
        console.log('✅ Security Schema Updated Successfully');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Error updating security schema:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
