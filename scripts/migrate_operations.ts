import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

// Fix for self-signed certs in dev
if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'UNDEFINED');

import fs from 'fs';
import path from 'path';

async function runMigration() {
    try {
        const { query } = await import('../src/lib/db');

        const sqlPath = path.join(process.cwd(), 'src', 'db', 'schema_operations.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running operations migration...');
        await query(sql);
        console.log('Operations migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
