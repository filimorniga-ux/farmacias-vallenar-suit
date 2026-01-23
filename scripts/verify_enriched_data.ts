
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
});

async function verify() {
    console.log('🔍 Verifying Enriched Data...');
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT name, isp_register, therapeutic_action, concentration, units, prescription_type
            FROM products 
            WHERE isp_register IS NOT NULL AND isp_register != ''
            LIMIT 5
        `);

        if (res.rows.length === 0) {
            console.error('❌ No enriched products found!');
        } else {
            console.log('✅ Found enriched products (Sample 5):');
            for (const p of res.rows) {
                console.log('---------------------------------------------------');
                console.log('📦 Name:', p.name);
                console.log('   - ISP Register:', p.isp_register);
                console.log('   - Therapeutic Action:', p.therapeutic_action);
                console.log('   - Concentration:', p.concentration);
                console.log('   - Units:', p.units);
            }
        }

        // Count stats
        const stats = await client.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(concentration) as with_conc,
                COUNT(therapeutic_action) as with_therap
            FROM products
        `);
        console.log('📊 Stats:', stats.rows[0]);

    } finally {
        client.release();
        await pool.end();
    }
}

verify().catch(console.error);
