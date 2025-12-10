
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function setupQuotes() {
    const { query } = await import('../lib/db');
    try {
        console.log('🚧 Setting up Quotes Schema...');

        await query(`
            CREATE TABLE IF NOT EXISTS quotes (
                id UUID PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                location_id TEXT, -- References locations(id) which might be text
                terminal_id TEXT, -- References terminals(id)
                user_id TEXT, -- References users(id) which is TEXT
                customer_id TEXT, -- References customers(id)
                total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, CONVERTED, EXPIRED
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
                metadata JSONB DEFAULT '{}'::jsonb
            );

            CREATE TABLE IF NOT EXISTS quote_items (
                id UUID PRIMARY KEY,
                quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
                product_id TEXT, -- References inventory or product
                product_name TEXT NOT NULL,
                -- Linking to inventory_batches is safer for POS but batches expire. 
                -- Ideally link to product BUT store price snapshot.
                -- Let's link to product_id if possible, or store name.
                -- For Simplicity & Consistency with Sales: link to inventory_batches (specific stock) IS RISKY if stock runs out.
                -- BUT POS sells batches.
                -- Let's store batch_id as nullable but prioritize product info snapshot.
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(12,2) NOT NULL,
                total DECIMAL(12,2) NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_quotes_code ON quotes(code);
            CREATE INDEX IF NOT EXISTS idx_quotes_location ON quotes(location_id);
            CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
        `);

        console.log('✅ Quotes Schema Created.');
    } catch (e) {
        console.error('❌ Error:', e);
    }
    process.exit(0);
}
setupQuotes();
