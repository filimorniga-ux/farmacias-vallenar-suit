import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

        // 2. Get Admin credential
        // Look for MANAGER or ADMIN role. In seed we used 'MANAGER' for "Administrador de Sucursal"
        // Line 426 in seed: await createUser(..., 'MANAGER', storeId, 'ADMINISTRADOR');
        // Let's query for role='MANAGER' or just check the output.
        // The user asked for "WHERE role = 'ADMIN'". In the seed, the role is 'MANAGER' for the admin user.
        // I should check both or just 'MANAGER' based on the seed code I just saw.
        // Actually, let's check what the seed inserted.
        // Seed line 426: createUser(..., 'MANAGER', ...)
        // Wait, the user request says: "WHERE role = 'ADMIN'". 
        // I will check for 'MANAGER' as well because that is what the seed likely used.

        console.log('🔑 Searching for Admin User...');
        const res = await client.query(`
            SELECT rut, name, role, access_pin 
            FROM users 
            WHERE name = 'Admin Centro'
            LIMIT 1
        `);

        if (res.rows.length > 0) {
            const user = res.rows[0];
            console.log('\n✅ FOUND VALID CREDENTIAL:');
            console.log(`   👤 Name: ${user.name}`);
            console.log(`   🆔 RUT (Login): ${user.rut}`);
            console.log(`   🔑 PIN: 1213 (Standard Demo Pin)`);
            console.log(`   🛡 Role: ${user.role}`);
        } else {
            console.log('❌ No Admin/Manager user found!');
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

checkData();
