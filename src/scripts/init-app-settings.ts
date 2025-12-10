import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Create a local pool to ensure we use the loaded env vars
// We cannot rely on importing from ../lib/db because that module might evaluate before dotenv loads if we are not careful,
// though normally imports happen top-down. To be safe, let's just create a pool here like the seed script.

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function initAppSettings() {
    console.log('🏗️ Initializing App Settings Table...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Create Table
        console.log('   Creating table if not exists...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key VARCHAR(50) PRIMARY KEY,
                value TEXT NOT NULL,
                description TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // 2. Insert Default Value (ADMIN_EMAIL)
        const defaultEmail = 'gerencia@vallenar.cl'; // Default from user request
        console.log(`   Seeding ADMIN_EMAIL: ${defaultEmail}`);

        await client.query(`
            INSERT INTO app_settings (key, value, description)
            VALUES ($1, $2, 'Correo maestro para alertas de seguridad y recuperación')
            ON CONFLICT (key) DO NOTHING
        `, ['ADMIN_EMAIL', defaultEmail]);

        await client.query('COMMIT');
        console.log('✅ App Settings initialized successfully.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing settings:', error);
    } finally {
        client.release();
        // Important: Do not close pool here if imported from lib/db as it might be used by app, 
        // but since this is a script, we might want to force exit or let the process handle it.
        // For a standalone script run via tsx, we usually want to close it to exit the process.
        // However, if we import 'pool' which implementation creates a global singleton...
        // Let's just exit process.
        process.exit(0);
    }
}

// Run if called directly
initAppSettings();
