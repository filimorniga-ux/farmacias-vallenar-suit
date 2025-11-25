import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function runMigrations() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL is not defined in .env.local');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: true, // Try simple boolean first, or object
    });
    // Hack for self-signed certs if the above doesn't work directly in some environments
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        console.log('🔌 Connecting to database...');
        const client = await pool.connect();

        try {
            console.log('📄 Reading init_db.sql...');
            const sqlPath = path.join(process.cwd(), 'scripts', 'init_db.sql');
            const sqlContent = fs.readFileSync(sqlPath, 'utf8');

            // Split into blocks
            const parts = sqlContent.split('-- BLOCK 2: SEED');

            const block1 = parts[0];
            const block2 = parts[1] ? '-- BLOCK 2: SEED' + parts[1] : '';

            console.log('🚀 Executing Block 1: Schema Creation...');
            await client.query(block1);
            console.log('✅ Block 1 completed.');

            if (block2) {
                console.log('🌱 Executing Block 2: Seeding & Cleanup...');
                await client.query(block2);
                console.log('✅ Block 2 completed.');
            }

            console.log('✨ All migrations finished successfully!');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
