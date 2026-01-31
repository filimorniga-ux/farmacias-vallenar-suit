
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ No connection string found');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function main() {
    console.log('🔧 Fixing Schema for Suppliers & Inventory...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Create suppliers table if not exists (Complete Definition from suppliers-v2.ts)
        await client.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id UUID PRIMARY KEY,
                rut VARCHAR(20) UNIQUE,
                business_name VARCHAR(255),
                fantasy_name VARCHAR(255),
                address TEXT,
                city VARCHAR(100),
                region VARCHAR(100),
                commune VARCHAR(100),
                phone_1 VARCHAR(50),
                phone_2 VARCHAR(50),
                contact_email VARCHAR(255),
                email_orders VARCHAR(255),
                email_billing VARCHAR(255),
                website VARCHAR(255),
                sector VARCHAR(100),
                payment_terms VARCHAR(50) DEFAULT 'CONTADO',
                lead_time_days INTEGER DEFAULT 7,
                metadata JSONB DEFAULT '{}',
                is_active BOOLEAN DEFAULT true,
                status VARCHAR(50) DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                deactivated_at TIMESTAMP,
                deactivation_reason TEXT
            )
        `);
        console.log('✅ Checked/Created suppliers table');

        // 2. Add missing columns to suppliers (if it existed but old schema)
        const supplierColumns = [
            'fantasy_name VARCHAR(255)', 'address TEXT', 'city VARCHAR(100)', 'region VARCHAR(100)', 'commune VARCHAR(100)',
            'phone_1 VARCHAR(50)', 'phone_2 VARCHAR(50)', 'contact_email VARCHAR(255)', 'email_orders VARCHAR(255)',
            'email_billing VARCHAR(255)', 'website VARCHAR(255)', 'sector VARCHAR(100)', 'payment_terms VARCHAR(50)',
            'lead_time_days INTEGER', 'metadata JSONB', 'status VARCHAR(50)', 'deactivated_at TIMESTAMP', 'deactivation_reason TEXT'
        ];

        for (const col of supplierColumns) {
            const colName = col.split(' ')[0];
            try {
                await client.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ${col}`);
            } catch (e) {
                console.log(`⚠️ Could not add column ${col} to suppliers (might exist with diff type)`);
            }
        }
        console.log('✅ Patched suppliers columns');

        // 3. Add missing columns to inventory_batches
        const batchColumns = [
            'supplier_id UUID',
            'invoice_number VARCHAR(100)',
            'invoice_date TIMESTAMP'
        ];

        for (const col of batchColumns) {
            try {
                await client.query(`ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS ${col}`);
            } catch (e) {
                console.log(`⚠️ Could not add column ${col} to inventory_batches`);
            }
        }
        console.log('✅ Patched inventory_batches columns');

        await client.query('COMMIT');
        console.log('🚀 Schema Fix Complete!');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Critical Error fixing schema:', e);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
