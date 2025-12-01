import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // Fallback

// Fix for self-signed certs in dev
if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'UNDEFINED');

async function runMigration() {
    try {
        const { pool } = await import('../src/lib/db');
        const client = await pool.connect();

        try {
            console.log('🔌 Connecting to database...');
            console.log('🛠️  Adding created_at column to products table...');

            await client.query(`
                ALTER TABLE products 
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
            `);

            console.log('✅ Migration successful: created_at column added.');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        // We need to close the pool to exit the script
        // But since pool is exported singleton, we might just exit process
        process.exit(0);
    }
}

runMigration();
