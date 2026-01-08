
import { pool } from '@/lib/db';

async function fixQuotesSchema() {
    const client = await pool.connect();
    try {
        console.log('🔄 Checking quotes table schema...');

        // Add customer_name
        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_name TEXT`);
            console.log('✅ Added customer_name');
        } catch (e: any) {
            console.error('⚠️ Error adding customer_name:', e.message);
        }

        // Add customer_phone
        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50)`);
            console.log('✅ Added customer_phone');
        } catch (e: any) {
            console.error('⚠️ Error adding customer_phone:', e.message);
        }

        // Add customer_email
        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)`);
            console.log('✅ Added customer_email');
        } catch (e: any) {
            console.error('⚠️ Error adding customer_email:', e.message);
        }

        console.log('🎉 Schema update complete!');
    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        client.release();
        process.exit(0);
    }
}

fixQuotesSchema();
