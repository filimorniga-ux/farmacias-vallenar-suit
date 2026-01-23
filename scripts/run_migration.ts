
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

const MIGRATION_FILE = 'migrations/add_enriched_product_fields.sql';

async function runMigration() {
    console.log('🚀 Running Migration...');
    try {
        const sql = fs.readFileSync(path.resolve(process.cwd(), MIGRATION_FILE), 'utf-8');
        const client = await pool.connect();
        try {
            await client.query(sql);
            console.log('✅ Migration applied successfully.');
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('❌ Migration failed:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
