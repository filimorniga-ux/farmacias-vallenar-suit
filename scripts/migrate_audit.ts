import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Try .env.local first
dotenv.config(); // Fallback to .env

console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'UNDEFINED');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import fs from 'fs';
import path from 'path';

async function runMigration() {
    try {
        // Dynamic import to ensure env vars are loaded first
        const { query } = await import('../src/lib/db');

        const sqlPath = path.join(process.cwd(), 'src', 'db', 'schema_audit.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        await query(sql);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

runMigration();
