
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getDatabaseUrl() {
    // Try .env.local first, then .env
    const envFiles = ['.env.local', '.env'];

    for (const file of envFiles) {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
            console.log(`📖 Reading config from ${file}...`);
            const content = fs.readFileSync(filePath, 'utf8');
            const match = content.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
            if (match && match[1]) {
                return match[1];
            }
        }
    }
    return process.env.DATABASE_URL;
}

async function fixQuotesSchema() {
    const connectionString = getDatabaseUrl();

    if (!connectionString) {
        console.error('❌ Could not find DATABASE_URL in .env or .env.local');
        process.exit(1);
    }

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

        // --- NEW COLUMNS ---

        // Financials
        const financialCols = ['subtotal', 'discount', 'total'];
        for (const col of financialCols) {
            try {
                await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ${col} NUMERIC(12,2) DEFAULT 0`);
                console.log(`✅ Added ${col}`);
            } catch (e) {
                console.error(`⚠️ Error adding ${col}:`, e.message);
            }
        }

        // Meta
        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING'`);
            console.log('✅ Added status');
        } catch (e) { console.error('⚠️ Error status:', e.message); }

        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS notes TEXT`);
            console.log('✅ Added notes');
        } catch (e) { console.error('⚠️ Error notes:', e.message); }

        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP`);
            console.log('✅ Added valid_until');
        } catch (e) { console.error('⚠️ Error valid_until:', e.message); }

        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_by UUID`);
            console.log('✅ Added created_by');
        } catch (e) { console.error('⚠️ Error created_by:', e.message); }

        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS location_id UUID`);
            console.log('✅ Added location_id');
        } catch (e) { console.error('⚠️ Error location_id:', e.message); }

        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS terminal_id UUID`);
            console.log('✅ Added terminal_id');
        } catch (e) { console.error('⚠️ Error terminal_id:', e.message); }

        try {
            await client.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS code VARCHAR(50)`);
            console.log('✅ Added code');
        } catch (e) { console.error('⚠️ Error code:', e.message); }

        // ==========================================
        // QUOTE ITEMS TABLE
        // ==========================================
        console.log('🔄 Checking quote_items table schema...');

        try {
            await client.query(`ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS sku VARCHAR(100)`);
            console.log('✅ Added quote_items.sku');
        } catch (e) { console.error('⚠️ Error adding sku:', e.message); }

        try {
            await client.query(`ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS name TEXT`);
            console.log('✅ Added quote_items.name');
        } catch (e) { console.error('⚠️ Error adding name:', e.message); }

        try {
            await client.query(`ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0`);
            console.log('✅ Added quote_items.discount_percent');
        } catch (e) { console.error('⚠️ Error adding discount_percent:', e.message); }

        try {
            await client.query(`ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0`);
            console.log('✅ Added quote_items.subtotal');
        } catch (e) { console.error('⚠️ Error adding quote_items.subtotal:', e.message); }

        try {
            await client.query(`ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) DEFAULT 0`);
            console.log('✅ Added quote_items.total');
        } catch (e) { console.error('⚠️ Error adding quote_items.total:', e.message); }

        console.log('🎉 Schema update complete!');
    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        await client.end();
    }
}

fixQuotesSchema();
