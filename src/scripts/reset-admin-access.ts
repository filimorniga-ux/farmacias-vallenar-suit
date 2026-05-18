
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEV_TEST_ACCOUNT, printDevAccountSummary } from './dev-account-support';

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

async function main() {
    const client = await pool.connect();
    try {
        console.log('🔓 Unlocking accounts...');

        // 1. Clear Lockouts
        await client.query("DELETE FROM login_attempts");
        console.log('✅ Login Attempts Cleared.');

        const userRes = await client.query(
            `
                SELECT id, name, rut, role, email, assigned_location_id
                FROM users
                WHERE email = $1 OR job_title = $2 OR name = $3
                ORDER BY updated_at DESC NULLS LAST
                LIMIT 1
            `,
            [DEV_TEST_ACCOUNT.email, DEV_TEST_ACCOUNT.jobTitle, DEV_TEST_ACCOUNT.name]
        );

        if (userRes.rowCount === 0) {
            console.warn('⚠️ No existe la cuenta DEV controlada en este entorno.');
            console.log(`Usa ${DEV_TEST_ACCOUNT.ensureCommand} para crearla o refrescarla.`);
            return;
        }

        const user = userRes.rows[0];
        console.log('\n--- 🔑 CUENTA DEV CONTROLADA ---');
        printDevAccountSummary();
        console.log(`   🆔 ID: ${user.id}`);
        console.log(`   📛 Nombre actual: ${user.name}`);
        console.log(`   🪪 RUT: ${user.rut}`);
        console.log(`   📧 Email actual: ${user.email}`);
        console.log('-------------------------------');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
