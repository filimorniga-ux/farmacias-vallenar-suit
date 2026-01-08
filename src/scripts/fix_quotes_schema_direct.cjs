
const { Client } = require('pg');

const connectionString = "postgresql://tsdbadmin:qpzm_1234@fw-sh-2z-10-233-132-233.timescaledb.io:32491/tsdb?sslmode=require";

async function fixQuotesSchema() {
    console.log('🔌 Connecting to DB...');
    const client = new Client({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected.');

        // Add customer_name
        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_name TEXT`);
            console.log('✅ Added customer_name');
        } catch (e) {
            console.error('⚠️ Error adding customer_name:', e.message);
        }

        // Add customer_phone
        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50)`);
            console.log('✅ Added customer_phone');
        } catch (e) {
            console.error('⚠️ Error adding customer_phone:', e.message);
        }

        // Add customer_email
        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255)`);
            console.log('✅ Added customer_email');
        } catch (e) {
            console.error('⚠️ Error adding customer_email:', e.message);
        }

        console.log('🎉 Schema update complete!');
    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        await client.end();
    }
}

fixQuotesSchema();
