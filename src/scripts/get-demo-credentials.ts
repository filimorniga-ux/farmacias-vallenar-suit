import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEV_TEST_ACCOUNT, printDevAccountSummary } from './dev-account-support';

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

async function checkData() {
    console.log('🕵️‍♀️ Verifying Data & Credentials...');
    const client = await pool.connect();
    try {
        // 1. Check Counts
        const batchCount = await client.query('SELECT count(*) FROM inventory_batches');
        const salesCount = await client.query('SELECT count(*) FROM sales');

        console.log(`📊 Inventory Batches: ${batchCount.rows[0].count}`);
        console.log(`📊 Total Sales: ${salesCount.rows[0].count}`);

        console.log('🔑 Searching for controlled DEV account...');
        const res = await client.query(`
            SELECT rut, name, role, email, is_active
            FROM users 
            WHERE email = $1 OR name = $2 OR job_title = $3
            LIMIT 1
        `, [DEV_TEST_ACCOUNT.email, DEV_TEST_ACCOUNT.name, DEV_TEST_ACCOUNT.jobTitle]);

        if (res.rows.length > 0) {
            const user = res.rows[0];
            console.log('\n✅ FOUND CONTROLLED DEV ACCOUNT:');
            printDevAccountSummary();
            console.log(`   🆔 RUT (Login): ${user.rut}`);
            console.log(`   📧 Email actual: ${user.email}`);
            console.log(`   🛡 Role actual: ${user.role}`);
            console.log(`   ✅ Activa: ${user.is_active ? 'sí' : 'no'}`);
        } else {
            console.log('❌ No se encontró la cuenta DEV controlada.');
            console.log(`Ejecuta ${DEV_TEST_ACCOUNT.ensureCommand} para crearla o refrescarla.`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

checkData();
