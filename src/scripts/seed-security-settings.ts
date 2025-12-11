
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pg;

// --- CONFIG ---
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
// Also try .env.local if .env didn't give us the URL (though we saw it in .env)
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ DATABASE_URL is not defined in .env or .env.local');
    process.exit(1);
}

const pool = new Pool({
    connectionString: connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
});

const DEFAULT_SETTINGS = [
    { key: 'SECURITY_IDLE_TIMEOUT_MINUTES', value: '5', description: 'Tiempo de inactividad antes del bloqueo automático (min)' },
    { key: 'SECURITY_MAX_LOGIN_ATTEMPTS', value: '5', description: 'Intentos fallidos antes de bloquear usuario' },
    { key: 'SECURITY_LOCKOUT_DURATION_MINUTES', value: '15', description: 'Duración del bloqueo temporal por intentos fallidos (min)' }
];

async function seedSettings() {
    console.log('🔒 Seeding Security Settings...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Ensure table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL,
                description TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        for (const setting of DEFAULT_SETTINGS) {
            await client.query(`
                INSERT INTO app_settings (key, value, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO NOTHING;
            `, [setting.key, setting.value, setting.description]);
            console.log(`✅ Setting ensure: ${setting.key}`);
        }

        await client.query('COMMIT');
        console.log('✅ Security Settings Seeded Successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error seeding settings:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

seedSettings();
