
import pg from 'pg';
const { Pool } = pg;
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// DB Connection
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

console.log('🔌 Connecting to DB to setup Treasury...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🏗️ Creating Treasury Tables...');

        // 1. Financial Accounts Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS financial_accounts (
                id UUID PRIMARY KEY,
                location_id UUID REFERENCES locations(id),
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('SAFE', 'BANK')),
                balance NUMERIC(12, 2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 2. Treasury Transactions Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS treasury_transactions (
                id UUID PRIMARY KEY,
                account_id UUID REFERENCES financial_accounts(id),
                amount NUMERIC(12, 2) NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
                description TEXT,
                related_entity_id UUID,
                created_by UUID,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 3. Treasury Remittances Table (Custody Chain)
        await client.query(`
            CREATE TABLE IF NOT EXISTS treasury_remittances (
                id UUID PRIMARY KEY,
                location_id UUID REFERENCES locations(id),
                source_terminal_id UUID REFERENCES terminals(id),
                amount NUMERIC(12, 2) NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('PENDING_RECEIPT', 'RECEIVED')),
                created_by UUID, -- Cashier
                received_by UUID, -- Manager
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✅ Tables created.');

        // 4. Seed "Caja Fuerte" for each Location
        console.log('🌱 Seeding Safes for Locations...');
        const locRes = await client.query("SELECT id, name FROM locations WHERE type != 'WAREHOUSE'"); // Only Stores need Safes usually

        for (const loc of locRes.rows) {
            // Check if Safe exists
            const safeRes = await client.query(
                "SELECT id FROM financial_accounts WHERE location_id = $1 AND type = 'SAFE'",
                [loc.id]
            );

            if (safeRes.rowCount === 0) {
                await client.query(`
                    INSERT INTO financial_accounts (id, location_id, name, type, balance)
                    VALUES ($1, $2, $3, 'SAFE', 0)
                `, [uuidv4(), loc.id, `Caja Fuerte - ${loc.name}`]);
                console.log(`   + Created Safe for: ${loc.name}`);
            } else {
                console.log(`   . Safe exists for: ${loc.name}`);
            }
        }

        console.log('✅ Treasury Setup Complete.');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
